# ТЗ для агента: роль R — симулятор, klend, проверки совместимости

## Контекст

Проект Connect Anything (полное ТЗ — `TZ.md` в корне репо, прочитай перед началом). Кратко: генератор превращает инструкцию любой Anchor-программы Solana в рецепт для Aurora Intents Connect. Пользователь платит USDC на EVM-сети (Base, Arbitrum, Ethereum) одной подписью, Connect привозит деньги на Solana и исполняет инструкции от имени **интермедиари** — MPC-аккаунта пользователя на Solana. Флагманский рецепт — погашение чужого долга на Kamino (программа klend).

Хакатон: промежуточная сдача 01.11.2026, финал 08.11.2026 23:59 UTC-12. Тестнета у Connect нет, каждая транзакция на mainnet стоит денег, поэтому всё сначала проверяется на форке — это твоя зона.

Роль T (другой разработчик) пишет `packages/core` (IDL, кодирование, резолвер аккаунтов), `apps/web`, интеграцию Connect SDK, экран Kamino. Не трогай их код без договорённости; общая точка — контракт `/simulate` ниже.

## Ограничения Connect, которые важны для симуляции

- Единственный signer пользовательских инструкций — интермедиари. Fee payer — релейер Aurora (Kora), не интермедиари.
- Лимит ~200k CU и 1232 байта на транзакцию; ≤ 50 шагов, ≤ 16 lookup-таблиц.
- ComputeBudget в шагах запрещён — его ставит релейер. Если в запросе есть инструкция ComputeBudget, это ошибка рецепта.
- Новые keypair-аккаунты создавать нельзя (их некому подписать). `init` на PDA — можно.
- Mint токена должен быть в allow-list Kora (`GET /api/v1/supported_tokens`). Для MVP токен — USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.

## Задачи

### 1. Каркас репо (29.10)

- Корень: pnpm workspaces (`packages/*`, `recipes/*`, `apps/*`) + cargo workspace (`crates/*`).
- `crates/sim` — бинарник HTTP-сервиса. Фреймворк — axum (или что минимальнее, без лишних зависимостей).
- Конфиг через env: `SIM_PORT`, `SOLANA_RPC_URL` (Helius, публичный RPC бьёт 429), `SURFPOOL_URL`.
- Пустые пакеты для T не создавай сверх `package.json` с именем — каркас внутри них делает T.

### 2. Сервис симуляции (30.10)

Движок — Surfpool (форк mainnet, отдаёт стандартный Solana RPC + чит-коды). Запасной вариант — LiteSVM, если Surfpool не заводится за полдня.

Алгоритм `POST /simulate`:

1. Валидировать запрос (контракт ниже). Отклонить ComputeBudget-инструкции.
2. Чит-кодом создать/пополнить ATA интермедиари по `fund.mint` на `fund.amount` (Surfpool: `surfnet_setTokenAccount`; сверить название и параметры с доками Surfpool). Дать SOL на ренту, если нужен `init` PDA.
3. Собрать v0-транзакцию: fee payer — отдельный тестовый аккаунт с SOL (имитирует релейер), интермедиари — второй signer. Подключить переданные lookup-таблицы.
4. `simulateTransaction` с `sigVerify: false`, `replaceRecentBlockhash: true` (подписать интермедиари мы не можем).
5. Вернуть `unitsConsumed`, размер сериализованной транзакции **с двумя подписями** (64 байта каждая), логи, разобранную ошибку.
6. Вердикт: `ok` / `warn` (CU > 200_000 или байт > 1232) / `fail` (ошибка исполнения или невалидный рецепт).

Разбор ошибок: `InstructionError(i, Custom(code))` → взять IDL программы инструкции `i` (из запроса) → `code >= 6000` ищется в `idl.errors`, коды Anchor-фреймворка (< 6000) — по таблице `anchor_lang::error::ErrorCode`. Результат: `{ instructionIndex, programId, code, name, message }`. Если IDL нет — только код и последние строки логов.

Сырые логи не обрезать, но в `error.message` — одна человекочитаемая строка.

### 3. Рецепт klend на форке (31.10)

Цель: погасить долг **чужой** obligation на форке, где signer — посторонний аккаунт (интермедиари), и выдать T точный порядок аккаунтов.

Порядок инструкций в одной транзакции:

1. `refresh_reserve` — по одной на каждый reserve позиции (deposits и borrows).
2. `refresh_obligation` — remaining accounts: reserves позиции в порядке, в котором их ожидает klend (проверь по коду: сначала deposits, потом borrows, в порядке слотов obligation).
3. `repay_obligation_liquidity_v2`:
   - `owner` = интермедиари (подписант перевода токена, не владелец позиции);
   - `obligation` = позиция пользователя (проверяется только `has_one = lending_market`);
   - `user_source_liquidity` = USDC ATA интермедиари;
   - farm-аккаунты — по IDL; отсутствующий optional-аккаунт в Anchor передаётся как program ID.
   - v1 (`repay_obligation_liquidity`) не используем: у неё строгий порядок окружающих инструкций.

Ориентиры CU (замеры с mainnet): refresh_reserve 14–24k каждая, refresh_obligation ~31k, repay_v2 ~35k, итого 1 залог + 1 долг ~115k (~140k с farm). Сверь на форке и запиши фактические цифры.

Подводный камень: `refresh_reserve` проверяет свежесть оракула относительно текущего слота. На форке форкай с последнего слота; если часы форка уходят от времени оракула — ловишь ошибку устаревшей цены. В LiteSVM — выставить sysvar Clock по mainnet.

Результат для T: `fixtures/klend-repay.sim.json` (рабочий запрос `/simulate`) и короткий markdown `recipes/kamino-rescue/ACCOUNTS.md`: какие аккаунты откуда берутся, порядок remaining accounts, замеры CU. Код рецепта на TS пишет T.

Тестовую позицию на mainnet открывает T; на форке можешь использовать любую реальную obligation с долгом в USDC.

### 4. Проверки совместимости (02–03.11)

Файл `packages/core/src/compat.ts` (TS — это библиотека, должна работать без сервиса):

```ts
export type CompatIssue = { account?: string; reason: string };
export function checkCompat(idl: Idl, ixName: string): CompatIssue[]; // [] = поддерживается
```

Правила (только по IDL, без сети):

- больше одного аккаунта с `signer: true` → «второй signer: Connect подписывает только интермедиари»;
- аккаунт с `signer: true` и признаком init без `pda` → «создание keypair-аккаунта не поддерживается»; init на PDA — ок. Как IDL 0.30+ отражает `init` — проверь на реальных IDL; если не отражает, правило «signer + writable + не PDA + не интермедиари» и пометка в причине;
- инструкция требует вызова ComputeBudget — не про IDL, это проверяет сервис.

Причины — на русском, одна строка, их увидит пользователь в UI.

Один тест-файл рядом (`compat.test.ts`, тот раннер, что выберет T для core) на 3 случая: klend repay_v2 — ок; инструкция с двумя signer — отказ; init на keypair — отказ.

### 5. Конвертер старого IDL (02–03.11)

Эндпоинт `POST /idl/convert` в том же сервисе: вход — legacy IDL (до 0.30) JSON, выход — IDL 0.30+. Использовать крейт `anchor-lang-idl` с фичей конвертации, не писать конвертер руками. T вызывает его из `core`, когда on-chain IDL оказался старым.

### 6. 3+ Anchor-программы (02–03.11)

klend плюс минимум две другие Anchor-программы mainnet, у которых есть on-chain IDL и инструкции, совместимые с Connect (один signer). Для каждой — пример запроса в `fixtures/` и успешная симуляция. Список программ и что пришлось чинить — в `fixtures/README.md`.

### 7. Деплой и сценарий сбоя (04.11)

- VPS: Surfpool + `crates/sim` под systemd или docker compose. Порт закрыт снаружи, кроме запросов от веба (или токен в заголовке `x-sim-token`, env `SIM_TOKEN`).
- Сценарий сбоя для демо: рецепт, который проходит до подписи, но падает при исполнении на Solana (например, repay с obligation другого lending market). Проверить на форке, что падает с понятной ошибкой, передать T.

### Стретч (05.11, только после живого теста MVP)

- При > 200k CU — предложить разбиение рецепта на несколько исполнений.
- Lookup-таблица рынка Kamino автоматически, чтобы уложиться в 1232 байта.

## Контракт `/simulate`

Фиксируется 29.10 вместе с T. Типы дублируются: TS в `packages/core/src/sim.ts`, Rust в `crates/sim/src/types.rs`. Примеры в `fixtures/*.sim.json` — источник истины; Rust-тест и TS-тест парсят одни и те же файлы.

```ts
type SimRequest = {
  intermediary: string;            // base58; в симуляции — любой ключ вместо {INTERMEDIARY}
  fund: { mint: string; amount: string }; // amount в минимальных единицах, строкой
  instructions: {
    programId: string;
    accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
    data: string;                  // base64
  }[];
  lookupTables?: string[];
  idls?: Record<string, unknown>;  // programId → IDL, для разбора ошибок
};

type SimResult = {
  verdict: "ok" | "warn" | "fail";
  computeUnits: number;
  txBytes: number;
  logs: string[];
  warnings: string[];              // "CU 230k > 200k", "1300 байт > 1232"
  error?: {
    instructionIndex?: number;
    programId?: string;
    code?: number;
    name?: string;
    message: string;
  };
};
```

`POST /idl/convert`: тело — legacy IDL JSON, ответ — IDL 0.30+ JSON или `400 { message }`.

## Готово, когда

- `fixtures/klend-repay.sim.json` на форке даёт `verdict: "ok"`, CU и байты в пределах лимитов.
- Ошибка программы в ответе содержит имя из IDL.
- `checkCompat` отклоняет второй signer и init на keypair; тест проходит.
- 3+ программы из `fixtures/` проходят симуляцию.
- `crates/sim` и Surfpool поднимаются с нуля по README на чистой машине.
- Ни одна транзакция не отправлена на mainnet из твоего кода — mainnet делает T через Connect.

## Не делать

- Не писать свой Borsh-кодер или резолвер аккаунтов — это `core` у T (`@coral-xyz/anchor`).
- Не добавлять ComputeBudget — его ставит релейер.
- Не поддерживать MarginFi и не-Anchor программы — вне рамок.
- Не обновлять версии SDK Aurora без согласования — альфа-API меняется, версии зафиксированы.

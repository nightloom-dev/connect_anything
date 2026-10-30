# ТЗ для агента: роль T — ядро, веб, Connect, Kamino

## Контекст

Проект Connect Anything (полное ТЗ — `TZ.md` в корне репо, прочитай перед началом). Кратко: генератор превращает инструкцию любой Anchor-программы Solana в рецепт для Aurora Intents Connect. Пользователь платит USDC на EVM-сети (Base, Arbitrum, Ethereum) одной подписью, Connect привозит деньги на Solana и исполняет инструкции от имени **интермедиари** — MPC-аккаунта пользователя на Solana. Флагманский рецепт — погашение чужого долга на Kamino (программа klend).

Хакатон: промежуточная сдача 01.11.2026, финал 08.11.2026 23:59 UTC-12. Тестнета у Connect нет: на mainnet тестируем суммами $1–5, бюджет на весь хакатон ~$30–50. Всё, что можно, сначала прогоняем через симулятор.

Роль R (другой разработчик) делает сервис симуляции `crates/sim` (Rust), `packages/core/src/compat.ts` (проверки совместимости), конвертер legacy IDL и разбор klend. Не трогай их код без договорённости; общая точка — контракт `/simulate` (полностью описан в `tz/rust.agent.md`, раздел «Контракт `/simulate`»).

## Зависимости

Версии SDK Aurora фиксировать точно (без `^`/`~`): альфа-API меняется.

- `@coral-xyz/anchor` — `BorshCoder`, типы IDL, PDA
- `@solana/web3.js`, `@solana/spl-token` (ATA)
- `@aurora-is-near/intents-connect-wallet` (`/solana` — `prepareSolanaSteps`, `/connect`)
- `@aurora-is-near/intents-connect/react`
- `@kamino-finance/klend-sdk`
- Next.js для `apps/web`

API Aurora SDK (`prepareSolanaSteps`, `SolanaRecipe`, раннер, `threeRound`, `deriveExecutionRecovery`, `outOperation`) сверяй с документацией Aurora и их примером Kamino; не угадывай сигнатуры.

## Ограничения Connect

| Ограничение                                              | Что делает код                                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Подписывает только интермедиари                          | Резолвер подставляет интермедиари во все signer-аккаунты; проверку отказа делает `checkCompat` от R |
| ComputeBudget запрещён                                   | `prepareSolanaSteps` убирает сам; не добавлять вручную                                              |
| Для Solana комиссия только `threeRound`                  | Точную сумму и комиссию показать до подписи; на `QUOTE_MOVED` — пересчитать и показать снова        |
| Одно исполнение на кошелёк на сеть (409)                 | Блокировать вторую кнопку, предлагать resume текущего                                               |
| `OPERATION_FAILED` терминальный, деньги у интермедиари   | Кнопки «Повторить» (steps-only) и «Вернуть» (`outOperation`)                                        |
| Mint в allow-list Kora                                   | Список токенов-целей только из `GET /api/v1/supported_tokens`                                       |
| Шаг должен касаться токена-цели (mint или ATA)          | `destinationIssue`: причина на экране 2, экраны 3–4 закрыты; `/r/:id` и `/kamino` не запускаются    |
| 503 — нет durable nonce                                  | Автоповтор через 2–3 с, до 3 раз                                                                    |
| Ключ `x-api-key` на каждый create                        | Только в серверном прокси; в клиентском бандле ключа быть не должно                                 |
| Solana-направления могут быть выключены (`solana: null`) | Запросить у Aurora 28.10                                                                            |

## Задачи

### 1. Доступ к Connect (28–29.10) — блокирует всё на mainnet

- Ключ в studio.aurora.dev; в Discord Aurora — включить Solana-направления для ключа.
- Запустить пример Aurora «Kamino с Base» на $2 без изменений → статус SUCCESS. Записать хеши транзакций в `docs/mainnet-log.md`.
- Задать Aurora открытые вопросы из `TZ.md` (правило `destination.tokenAddress` для Solana, allow-list Kora с USDC). Ответы — туда же.

### 2. Контракт `/simulate` (29.10, вместе с R)

`packages/core/src/sim.ts` — TS-типы `SimRequest`/`SimResult` из `tz/rust.agent.md`. Функция `toSimRequest(instructions, ctx)` превращает собранные инструкции в запрос.

### 3. `packages/core` (30.10)

Публичное API библиотеки (имена — ориентир, держи минимально):

```ts
loadIdl(programId: string, rpc: Connection): Promise<Idl>   // on-chain IDL-аккаунт Anchor
parseIdl(json: unknown): Promise<Idl>                         // файл; legacy → POST /idl/convert у R
listInstructions(idl: Idl): IxInfo[]
argFields(idl: Idl, ixName: string): Field[]                  // схема формы
resolveAccounts(idl, ixName, args, ctx, hints?): ResolvedAccount[]
buildInstruction(idl, ixName, args, accounts): TransactionInstruction
toRecipeCode(steps): string                                   // экспорт SolanaRecipe как TS-код
```

- **IDL:** on-chain IDL лежит в аккаунте Anchor IDL (адрес выводится из program ID), данные сжаты zlib. Формат 0.30+ (есть поле `address`). Legacy — через конвертер R.
- **Форма:** типы u8–u128, i8–i128 (большие — строкой, `BN`), bool, pubkey, string, bytes, Option, Vec, массивы, defined struct/enum. Возвращать схему, не JSX — UI рисует веб.
- **Кодирование:** только `BorshCoder` из `@coral-xyz/anchor`; свой кодер не писать.
- **Резолвер,** по приоритету:
  1. `signer: true` → `ctx.intermediary`;
  2. `address` в IDL → фиксированный адрес;
  3. `pda` в IDL → `findProgramAddressSync` по seeds (const, arg, account — из уже разрешённых аккаунтов);
  4. ATA интермедиари по mint, если аккаунт — токен-аккаунт интермедиари;
  5. подсказка рецепта (`hints`) — например reserve из obligation;
  6. иначе — поле ввода. Каждый аккаунт помечать источником: `auto` / `recipe` / `input`.
- В симуляцию интермедиари — любой ключ; в рецепт для Connect — плейсхолдер `{INTERMEDIARY}` через `prepareSolanaSteps`.
- Тесты: один файл на кодирование + резолвер на IDL klend (`repay_obligation_liquidity_v2`): данные совпадают с реальной mainnet-транзакцией repay, PDA совпадают.

### 4. Kamino на mainnet (30–31.10)

- Тестовая позиция в Phantom: залог SOL на $10–20, займ USDC близко к максимальному LTV. Маленькая — её могут реально ликвидировать.
- Рецепт `recipes/kamino-rescue`: refresh_reserve × N → refresh_obligation → repay_obligation_liquidity_v2. Порядок аккаунтов и remaining accounts — из `recipes/kamino-rescue/ACCOUNTS.md` от R; пока его нет — по примеру Aurora.
- `liquidity_amount` = `ctx.amount` (точная сумма из `threeRound`). Излишек остаётся у интермедиари — его забирает кнопка «Вернуть».
- 31.10: погашение долга тестовой позиции с Base через Connect на mainnet, рецепт пока ручной. Хеши — в `docs/mainnet-log.md`.

### 5. `apps/web` (02–03.11)

API-маршруты:

- `GET /api/idl/:programId` — IDL и список инструкций
- `POST /api/simulate` — прокси в `SIM_URL` (сервис R), добавляет `x-sim-token` из env
- `POST /api/recipes` → id; `GET /r/:id` — страница исполнения. Хранилище — самое простое, что переживает рестарт (файл/SQLite/KV у хостинга)
- `GET /api/kamino/:wallet` — obligations, LTV, сколько гасить
- `/api/intents-connect/*` — прокси к Connect, добавляет `x-api-key` из env

Экраны:

1. Ввод program ID (или загрузка файла IDL)
2. Выбор инструкции, форма аргументов, аккаунты с пометкой «найден сам»; результат `checkCompat` — если не пусто, причина и кнопка неактивна
3. Отчёт симуляции (CU X / 200k, байты X / 1232, логи, ошибка) и экспорт: TS-код и ссылка `/r/:id`
4. Исполнение: EVM-кошелёк, сеть (Base / Arbitrum / Ethereum) и токен источника, точная сумма и комиссия до подписи, подпись, статусы (депозит → мост → исполнение → SUCCESS/FAILED), ссылки на транзакции, «Повторить» и «Вернуть»
5. «Спасти Kamino» (04.11): адрес кошелька → obligations и LTV → сумма до целевого LTV → экран 4 с готовым рецептом

Сумма погашения: B — долг в $, C — залог в $, t — целевой LTV; x = B − t·C (не меньше 0, не больше B). Данные — `@kamino-finance/klend-sdk`. Учесть, что от подписи до исполнения проходит ~150 с плюс MPC-подпись: показать это пользователю.

### 6. Сбои (04.11)

- `OPERATION_FAILED`: `deriveExecutionRecovery` + кнопки «Повторить» (steps-only) и «Вернуть» (`outOperation`) — проверить обе на mainnet. Сценарий сломанного шага даёт R.
- 409, 503, `QUOTE_MOVED` — по таблице ограничений выше.

### Стретч (05.11, только после живого теста MVP)

- `apps/watch`: Telegram-сторож LTV (grammY или Bot API), присылает ссылку на экран 5. Порог для демо ниже обычного.
- Сети-источники Solana, NEAR (подпись есть в SDK). Tron и TON — нет.

## Готово, когда

- Чужой долг Kamino погашен с Base одной подписью на mainnet, SUCCESS, хеши в `docs/mainnet-log.md`.
- Сбой → «Повторить» и «Вернуть» отработали на mainnet.
- Исполнение работает из Base, Arbitrum и Ethereum.
- `grep` по клиентскому бандлу (`.next/static`) не находит API-ключ.
- Рецепт экспортируется TS-кодом и ссылкой `/r/:id`, ссылка открывается в новом браузере.
- Тест core на klend проходит.
- README поднимает веб с нуля на чистой машине.

## Не делать

- Не писать свой Borsh-кодер, симулятор или конвертер IDL.
- Не отдавать `x-api-key` в браузер ни в каком виде (`NEXT_PUBLIC_*` — нельзя).
- Не тратить больше $5 на один mainnet-тест; сначала симуляция.
- Не поддерживать MarginFi (repay требует authority) и не-Anchor программы.
- Не брать `repay_obligation_liquidity` v1.

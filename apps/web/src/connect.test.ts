import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIntentsConnectApi, type Execution, type FetchLike, type SolanaRecipe, type SolanaStep } from '@aurora-is-near/intents-connect';
import { usdToAtomic } from '@connect-anything/kamino-rescue';
import { STAGE_OF, bridgePlan, existingOffer, explain, fromAtomic, isQuoteMoved, refundBody, retry503, retryPlan, stoppedFollowing, toAtomic, type Token } from './connect.ts';
import { BASE_USDC, SOLANA_USDC, supplyPlan } from './kamino.ts';

const answering = (...statuses: number[]) => {
  const seen: string[] = [];
  const fetchImpl: FetchLike = async input => {
    seen.push(input);
    const status = statuses.shift()!;
    return { ok: status < 400, status, text: async () => '{}' };
  };
  return { seen, fetchImpl };
};

const CREATE = 'https://app.example/api/intents-connect/api/v1/executions/0xabc';
const SUBMIT = 'https://intents-connect-api.aurora.dev/api/v1/executions/0xabc/submit';
const POST = { method: 'POST', headers: {} } as const;

test('a create answered with 503 is retried up to 3 times, about 2.5 s apart, and then the 503 is the answer', async () => {
  const waits: number[] = [];
  const wait = async (ms: number) => void waits.push(ms);

  const recovers = answering(503, 503, 200);
  assert.equal((await retry503(recovers.fetchImpl, wait)(CREATE, POST)).status, 200);
  assert.equal(recovers.seen.length, 3);
  assert.deepEqual(waits, [2500, 2500]);

  const stays = answering(503, 503, 503, 503, 200);
  assert.equal((await retry503(stays.fetchImpl, wait)(CREATE, POST)).status, 503);
  assert.equal(stays.seen.length, 4, 'the call and 3 retries');
});

test('only a create is retried, and only on 503', async () => {
  const wait = async () => assert.fail('must not wait');
  for (const [url, init, status] of [
    [SUBMIT, POST, 503], // the signature may have landed, this is not known to be safe to send twice
    [CREATE, { method: 'GET', headers: {} }, 503],
    [CREATE, POST, 500],
    [CREATE, POST, 409],
  ] as const) {
    const { seen, fetchImpl } = answering(status, 200);
    assert.equal((await retry503(fetchImpl, wait)(url, init)).status, status);
    assert.equal(seen.length, 1);
  }
});

test('only a create that stayed at 503 says nothing was created: a 503 on a poll or a signature may have money behind it', async () => {
  const wait = async () => {};
  const api = createIntentsConnectApi({ baseUrl: 'https://connect.example', apiKeyProxyUrl: 'https://app.example/api/intents-connect', fetch: retry503(async () => ({ ok: false, status: 503, text: async () => '{"error":"no durable nonce account available, retry shortly"}' }), wait) });
  const told = (call: Promise<unknown>) => call.then(() => assert.fail('must fail'), explain);

  for (const create of [api.createExecution('0xabc', {} as never), api.createStepsExecution('0xabc', {} as never)]) {
    assert.match(await told(create), /no durable nonce free.*Nothing was created/);
  }
  for (const other of [api.listExecutions('0xabc', { id: 'ex-1' }), api.submitSignature('0xabc', {} as never), api.getIntermediary('0xabc')]) {
    const said = await told(other);
    assert.match(said, /may still be running/);
    assert.doesNotMatch(said, /Nothing was created|nonce/);
  }
});

test('a 503 from the routes of this app keeps its own message', () => {
  assert.equal(explain(Object.assign(new Error('The simulator is offline: it did not answer'), { status: 503 })), 'The simulator is offline: it did not answer');
});

test('a flow that stopped before its execution ended holds the page, whatever status it stopped at, EXPIRED too', () => {
  const stopped = { phase: 'failed', executionId: 'ex-1' } as const;
  for (const status of ['CREATED', 'DEPOSIT_PENDING', 'DEPOSIT_PROCESSING', 'OPERATION_PENDING', 'OPERATION_PROCESSING', 'EXPIRED'] as const) assert.equal(stoppedFollowing({ ...stopped, status }), true, status);
  for (const status of ['SUCCESS', 'DEPOSIT_FAILED', 'OPERATION_FAILED'] as const) assert.equal(stoppedFollowing({ ...stopped, status }), false, status);
  assert.equal(stoppedFollowing({ ...stopped, status: 'DEPOSIT_PENDING', recovery: {} }), false, 'a recovery has its own buttons');
  assert.equal(stoppedFollowing({ phase: 'settling', executionId: 'ex-1', status: 'DEPOSIT_PENDING' }), false, 'still following');
  assert.equal(stoppedFollowing({ phase: 'failed' }), false, 'nothing was created');
});

const BASE: Token = { assetId: BASE_USDC.assetId, symbol: 'USDC', blockchain: 'base', contractAddress: BASE_USDC.contractAddress, decimals: BASE_USDC.decimals };
const supply = supplyPlan('5000000');

test('the plan of a generated recipe is the plan of the Kamino supply that ran on mainnet', () => {
  const { quote: { deadline: _a, ...quote }, ...plan } = bridgePlan(supply.recipe as SolanaRecipe, BASE, '5000000');
  const { quote: { deadline: _b, ...knownQuote }, ...known } = supply;
  assert.deepEqual({ ...plan, quote }, { ...known, quote: knownQuote });
  assert.deepEqual(plan.feeStrategy, { kind: 'threeRound', amountReserveBps: 25 });
});

test('a native source token carries no contract, so the wallet sends the coin', () => {
  const plan = bridgePlan(supply.recipe as SolanaRecipe, { ...BASE, assetId: 'nep141:base.omft.near', symbol: 'ETH', contractAddress: '', decimals: 18 }, '1');
  assert.equal(plan.originToken.contractAddress, undefined);
});

test('every source chain has a chain id', () => {
  for (const blockchain of ['base', 'arb', 'eth']) assert.ok(bridgePlan(supply.recipe as SolanaRecipe, { ...BASE, blockchain }, '1').originChainId);
});

test('a retry spends the balance with no deposit, and the fee comes out of it', () => {
  const plan = retryPlan(supply.recipe as SolanaRecipe, '123');
  assert.equal(plan.recipe.flow, 'steps-only');
  assert.equal(plan.amount, '123');
  assert.deepEqual(plan.feeFromAmount, { amountReserveBps: 25 });
});

test('a refund moves the whole balance back to the wallet in the shape of the withdraw scenario', () => {
  const token: Token = { assetId: SOLANA_USDC, symbol: 'USDC', blockchain: 'sol', contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 };
  const body = refundBody({ account: 'ATA', tokenProgram: 'Tokenkeg', token, amount: '4200000', backTo: BASE.assetId, recipient: '0xabc', dry: true });
  assert.equal(body.outOperation, true);
  assert.equal(body.dry, true);
  assert.equal(body.type, 'solana');
  const { deadline: _, ...quote } = body.quote;
  assert.deepEqual(quote, { originAsset: SOLANA_USDC, destinationAsset: BASE.assetId, amount: '4200000', recipient: '0xabc', swapType: 'EXACT_INPUT', slippageTolerance: 100 });
  const [producer] = body.steps as SolanaStep[];
  assert.deepEqual(producer.accounts, [
    { pubkey: 'ATA', isSigner: false, isWritable: true },
    { pubkey: token.contractAddress, isSigner: false, isWritable: false },
    { pubkey: '{DEPOSIT_ADDRESS}', isSigner: false, isWritable: true },
    { pubkey: '{INTERMEDIARY}', isSigner: true, isWritable: false },
  ]);
  assert.equal(body.steps.length, 1);
});

test('amounts convert exactly, and what is not an amount of the token is refused', () => {
  assert.equal(toAtomic('5', 6), '5000000');
  assert.equal(toAtomic('1.5', 6), '1500000');
  assert.equal(toAtomic('.5', 6), '500000');
  assert.equal(toAtomic(' 0.000001 ', 6), '1');
  assert.equal(toAtomic('123456789012345678901234567890.123456789012345678', 18), '123456789012345678901234567890123456789012345678');
  for (const bad of ['', '.', '0', '0.0', '-1', '1e3', '1.2.3', 'abc', '1.0000001']) assert.equal(toAtomic(bad, 6), null, bad);

  assert.equal(fromAtomic('5000000', 6), '5');
  assert.equal(fromAtomic('1500000', 6), '1.5');
  assert.equal(fromAtomic('1', 6), '0.000001');
  assert.equal(fromAtomic('0', 6), '0');
  assert.equal(fromAtomic('12', 0), '12');
});

test('errors the screens act on are told apart', () => {
  assert.ok(isQuoteMoved(Object.assign(new Error('moved'), { code: 'QUOTE_MOVED' })));
  assert.ok(!isQuoteMoved(new Error('moved')));
  assert.ok(!isQuoteMoved(undefined));
  assert.equal(explain(new Error('execution OPERATION_FAILED')), '');
  assert.equal(explain(new Error('boom')), 'boom');
  assert.match(explain(Object.assign(new Error('x'), { code: 'NO_INTERMEDIARY' })), /not enabled/);
  assert.match(explain({ code: 4001 }), /rejected/);
});

test('every status has a place on the status line', () => {
  assert.deepEqual([STAGE_OF.CREATED, STAGE_OF.DEPOSIT_PENDING, STAGE_OF.DEPOSIT_PROCESSING, STAGE_OF.OPERATION_PROCESSING, STAGE_OF.SUCCESS, STAGE_OF.OPERATION_FAILED], [0, 1, 2, 3, 4, 4]);
});

test('the rescue amount in dollars reaches the amount box as USDC and comes back the same', () => {
  const debt = { amount: '100000000', usd: 99.98 };
  const atomic = usdToAtomic(10, debt);
  assert.equal(fromAtomic(atomic, 6), '10.002001');
  assert.equal(toAtomic(fromAtomic(atomic, 6), 6), atomic);
  assert.equal(fromAtomic(usdToAtomic(0.000001, { amount: '1000000', usd: 1 }), 6), '0.000001');
  assert.equal(toAtomic(fromAtomic(usdToAtomic(1234.5, { amount: '5000000000', usd: 5000 }), 6), 6), '1234500000');
});

const unsigned = { messageSigned: false, payload: {} } as Execution['details'];
const signed = { messageSigned: true, payload: {} } as Execution['details'];
const offer = (status: Execution['status'], details: Execution['details'], same: boolean | undefined, gate = '', listed = false) => existingOffer({ status, details }, { same, gate, listed });

test('an unsigned execution of anything else offers only its deletion, and that one is free of warnings', () => {
  const planted = offer('CREATED', unsigned, false);
  assert.equal(planted.resumable, false);
  assert.equal(planted.asksWallet, true, 'whatever asks the wallet can be deleted');
  assert.equal(planted.deletable, true);
  assert.equal(offer('CREATED', unsigned, false, '', true).resumable, false, 'nor from the list of this browser');
});

test('the wallet is asked only for the recipe on this page, once nothing keeps it from running', () => {
  assert.deepEqual([offer('CREATED', unsigned, true).resumable, offer('CREATED', unsigned, true).open], [true, true]);
  assert.equal(offer('CREATED', unsigned, true, 'Tick the box above first.').open, false);
  assert.equal(offer('CREATED', unsigned, undefined).open, false, 'not before it can be compared');
  // messageSigned is optional on the wire, and without it the SDK signs
  assert.equal(offer('CREATED', { payload: {} } as Execution['details'], false).resumable, false);
  // a signed CREATED one is signed no more, but a resume still asks for its deposit
  assert.equal(offer('CREATED', signed, false).resumable, false);
  assert.equal(offer('CREATED', signed, false).deletable, false, 'it may hold money, so it comes with the warning');
  // a deposit can be seen before the signature
  assert.equal(offer('DEPOSIT_PROCESSING', unsigned, false).resumable, false);
  assert.equal(offer('DEPOSIT_PROCESSING', unsigned, false).deletable, false);
});

test('a signed execution past CREATED is only followed, and nothing offers to delete it in one click', () => {
  for (const status of ['DEPOSIT_PENDING', 'DEPOSIT_PROCESSING', 'OPERATION_PENDING', 'OPERATION_PROCESSING'] as const) {
    const live = offer(status, signed, false, 'Tick the box above first.');
    assert.deepEqual([live.asksWallet, live.deletable, live.resumable, live.open], [false, false, true, true], status);
  }
  const expired = offer('EXPIRED', signed, false, 'Tick the box above first.', true);
  assert.deepEqual([expired.resumable, expired.open], [true, true], 'a late deposit can still revive it');
});

test('a finished execution leads to Retry, so it waits for the tick box, and a 409 that has ended offers a new run', () => {
  assert.equal(offer('OPERATION_FAILED', signed, true, 'Tick the box above first.', true).open, false);
  assert.equal(offer('OPERATION_FAILED', signed, true, '', true).open, true);
  assert.equal(offer('SUCCESS', signed, true).over, true);
  assert.equal(offer('SUCCESS', signed, true).resumable, false);
  assert.equal(offer('OPERATION_FAILED', signed, true, '', true).over, false, 'the list keeps it, for what it left behind');
});

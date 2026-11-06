import type { Route } from '@playwright/test';
import { Gates } from './gates.ts';
import { tokenOf } from './tokens.ts';

// A fake Intents Connect API, in the wire format of @aurora-is-near/intents-connect 7.28.0 (src/api): bodies wrapped in
// { result }, errors as { error }, 409 for a second execution in flight. One instance per test keeps every execution
// that test creates, across reloads of the page. Nothing checks a signature.

export type Status = 'CREATED' | 'DEPOSIT_PENDING' | 'DEPOSIT_PROCESSING' | 'OPERATION_PENDING' | 'OPERATION_PROCESSING' | 'SUCCESS' | 'DEPOSIT_FAILED' | 'OPERATION_FAILED' | 'EXPIRED';
const IN_FLIGHT: Status[] = ['CREATED', 'DEPOSIT_PENDING', 'DEPOSIT_PROCESSING', 'OPERATION_PENDING', 'OPERATION_PROCESSING'];

/** The Solana intermediary of the mock wallet. */
export const INTERMEDIARY = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
/** The Solana transaction of every execution that ran. */
export const SOLANA_TX = '5j7s1QzqC9JZtV3XbJrK4m8nW2pF6dY9uH3gL1aB7cE5vR8tN2kM4qP6sD9fG3hJ5kL7mN9pQ2rS4tV6wX8yZ1a';
/** Where a Refund sends the intermediary's tokens: the bridge's deposit address on Solana. */
const SOLANA_DEPOSIT = 'HuKpPBfBG5fGfNmrhjsiQk6cQ8VbW4VQaLJ8zQqv8bNc';

type Kind = 'bridge-in' | 'refund' | 'steps-only';

export type FakeExecution = {
  id: string;
  createdAt: string;
  status: Status;
  type: 'solana';
  executionMode?: 'quote_with_steps' | 'steps_only';
  quote: Record<string, unknown> & { amount: string; minAmountOut: string; depositAddress: string };
  details: { intermediaryAddress: string; networkFee?: string; messageSigned: boolean; signingStandard: 'erc191'; payload: { standard: 'erc191'; payload_json: string; payload_bytes_base64: string } };
  steps: unknown[];
  metadata?: Record<string, unknown>;
  transaction: { evmTxHash?: string; solanaTxHash?: string };
};

type Kept = {
  wire: FakeExecution;
  wallet: string;
  kind: Kind;
  /** The deposit is in, or nothing has to be deposited, so reads play the script. */
  funded: boolean;
  /** The status each read by id moves to, once funded. The last one stays. */
  script: Status[];
};

export type ConnectRoute = 'intermediary' | 'dry-create' | 'create' | 'steps' | 'submit' | 'deposit' | 'poll' | 'list' | 'delete';

const wrap = (result: unknown) => ({ result });

export class FakeConnect {
  /** The Solana intermediary the lookup answers. null: Solana is not enabled for the key. */
  intermediary: string | null = INTERMEDIARY;
  /** Every request answers this status instead, as when Connect is down. */
  down?: number;
  /** The next lookups of the intermediary that fail, and with what status. */
  lookupFailures = 0;
  lookupStatus = 500;
  /** The next creates, dry or real, that answer 503: no durable nonce free. */
  failCreates = 0;
  /** The next reads of one execution (the runner's polls) that answer 503. */
  failReads = 0;
  /** What the bridge keeps of a payment in basis points, before the 1% slippage the app asks for. */
  bridgeBps = 200;
  /** The network fee Connect states, in atomic units of the token delivered. */
  networkFee = '20000';
  /** The next real create finds the market this many basis points lower, and later quotes stay there. */
  moveOnCreate = 0;
  /** The clock of createdAt. Screenshots set it, so that the card's times are the same every run. */
  now = () => new Date();
  /** Status scripts of the next real creates, in order. The others get `script`. */
  readonly scripts: Status[][] = [];
  script: Status[] = ['SUCCESS'];
  /** Every request, in order. */
  readonly requests: { method: string; path: string; body?: any }[] = [];
  readonly unexpected: string[] = [];
  private readonly executions = new Map<string, Kept>();
  private readonly gates = new Gates<ConnectRoute>();
  private created = 0;
  private moved = 0;
  private lastPreview?: { quote: any; steps: unknown[]; metadata?: Record<string, unknown>; spendable: string };

  /** Holds the next request of this kind until `release`. */
  hold(kind: ConnectRoute) {
    return this.gates.hold(kind);
  }

  /** The executions that exist, oldest first. */
  list() {
    return [...this.executions.values()].map(({ wire }) => wire);
  }

  get(id: string) {
    const kept = this.executions.get(id);
    if (!kept) throw new Error(`The fake Connect has no execution ${id}`);
    return kept;
  }

  /** Adds statuses an execution moves through on the next reads, once funded. */
  then(id: string, ...statuses: Status[]) {
    this.get(id).script.push(...statuses);
  }

  /**
   * An execution this page did not create in this session: from another tab, another browser or someone else. Its steps
   * are those of the page's last quote unless given, so it is the recipe on the page.
   */
  seed({ wallet, status, signed, steps, script = [], funded = false }: { wallet: string; status: Status; signed: boolean; steps?: unknown[]; script?: Status[]; funded?: boolean }) {
    if (!this.lastPreview) throw new Error('seed() copies the last quote: get one on the page first');
    const { quote, spendable } = this.lastPreview;
    // a real create carries the amount its steps were built for, and a resume refuses an execution without it
    const metadata = { ...this.lastPreview.metadata, intentsConnectSpendable: spendable };
    const kept = this.store(wallet, 'bridge-in', { quote, steps: steps ?? this.lastPreview.steps, metadata }, script);
    Object.assign(kept, { funded });
    kept.wire.status = status;
    kept.wire.details.messageSigned = signed;
    return kept.wire;
  }

  async handle(route: Route, path: string, url: URL) {
    const request = route.request();
    const method = request.method();
    const text = request.postData();
    const body = text ? JSON.parse(text) : undefined;
    this.requests.push({ method, path, body });
    const answer = (status: number, json: unknown) => route.fulfill({ status, json });
    const error = (status: number, message: string) => answer(status, { error: message });
    let match: RegExpExecArray | null;

    if (this.down) return error(this.down, 'Service Unavailable');

    if (method === 'GET' && (match = /^\/api\/v1\/executions\/([^/]+)\/intermediary$/.exec(path))) {
      await this.gates.pass('intermediary');
      if (this.lookupFailures > 0) {
        this.lookupFailures--;
        return error(this.lookupStatus, this.lookupStatus === 503 ? 'Service Unavailable' : 'Internal server error');
      }
      const wallet = decodeURIComponent(match[1]);
      return answer(200, wrap({ originAccount: wallet, originType: 'evm', evm: wallet, solana: this.intermediary }));
    }

    if (method === 'POST' && path === '/api/v1/executions/deposit/submit') {
      await this.gates.pass('deposit');
      const kept = [...this.executions.values()].reverse().find(({ wire }) => wire.quote.depositAddress === body.depositAddress);
      if (!kept) return error(404, 'No execution has this deposit address');
      kept.wire.transaction.evmTxHash = body.txHash;
      kept.funded = true;
      return answer(200, wrap({ txHash: body.txHash }));
    }

    if (method === 'POST' && (match = /^\/api\/v1\/executions\/([^/]+)\/submit$/.exec(path))) {
      await this.gates.pass('submit');
      const kept = this.executions.get(body.executionId);
      if (!kept) return error(404, 'Execution not found');
      if (kept.wire.status !== 'CREATED' || kept.wire.details.messageSigned) return error(400, 'The execution is already signed');
      kept.wire.details.messageSigned = true;
      if (kept.kind === 'bridge-in') {
        kept.wire.status = 'DEPOSIT_PENDING';
        return answer(200, wrap({ status: 'SIGNED_PENDING_DEPOSIT' }));
      }
      // a Refund or a run of steps spends what the intermediary holds, so nothing is deposited
      kept.wire.status = 'OPERATION_PENDING';
      kept.funded = true;
      return answer(200, wrap({ status: 'SIGNING' }));
    }

    if (method === 'POST' && (match = /^\/api\/v1\/executions\/([^/]+)(\/steps)?$/.exec(path))) {
      const steps = !!match[2];
      await this.gates.pass(steps ? 'steps' : body.dry ? 'dry-create' : 'create');
      if (this.failCreates > 0) {
        this.failCreates--;
        return error(503, 'No durable nonce available');
      }
      const wallet = decodeURIComponent(match[1]);
      if (!body.dry) {
        const open = this.list().find(execution => this.ownedBy(execution.id, wallet) && IN_FLIGHT.includes(execution.status));
        if (open) return error(409, `Execution ${open.id} is already in flight for this wallet`);
        if (!Array.isArray(body.steps) || body.steps.length === 0) return error(400, 'dry: false requires steps');
        this.moved += this.moveOnCreate;
        this.moveOnCreate = 0;
      }
      const kind: Kind = steps ? 'steps-only' : body.outOperation ? 'refund' : 'bridge-in';
      if (body.dry) {
        const draft = this.draft('dry', kind, body);
        if (kind === 'bridge-in' && body.steps.length) {
          // what the SDK makes of this quote: minAmountOut less the fee, less its reserve of 0.25% for the quote to move
          const spendable = ((BigInt(draft.quote.minAmountOut) - BigInt(this.networkFee)) * 9_975n) / 10_000n;
          this.lastPreview = { quote: body.quote, steps: body.steps, metadata: body.metadata, spendable: String(spendable) };
        }
        return answer(200, wrap(draft));
      }
      return answer(200, wrap(this.store(wallet, kind, body, this.scripts.shift() ?? this.script).wire));
    }

    if (method === 'GET' && (match = /^\/api\/v1\/executions\/([^/]+)$/.exec(path))) {
      const wallet = decodeURIComponent(match[1]);
      const id = url.searchParams.get('id');
      if (id) {
        await this.gates.pass('poll');
        if (this.failReads > 0) {
          this.failReads--;
          return error(503, 'Service Unavailable');
        }
        const kept = this.executions.get(id);
        if (!kept || !this.ownedBy(id, wallet)) return answer(200, wrap([]));
        this.play(kept);
        return answer(200, wrap([structuredClone(kept.wire)]));
      }
      await this.gates.pass('list');
      const statuses = url.searchParams.get('status')?.split(',');
      const found = this.list().filter(execution => this.ownedBy(execution.id, wallet) && (!statuses || statuses.includes(execution.status)));
      return answer(200, wrap(structuredClone(found)));
    }

    if (method === 'DELETE' && (match = /^\/api\/v1\/executions\/([^/]+)\/([^/]+)$/.exec(path))) {
      await this.gates.pass('delete');
      const id = decodeURIComponent(match[2]);
      if (!this.executions.has(id) || !this.ownedBy(id, decodeURIComponent(match[1]))) return error(404, 'Execution not found');
      if (typeof body?.signature !== 'string') return error(400, 'A deletion needs a signature');
      this.executions.delete(id);
      return answer(200, wrap({ id, deleted: true }));
    }

    if (method === 'GET' && path === '/api/v1/supported_tokens') return answer(200, wrap({ in: [], out: [] }));

    this.unexpected.push(`${method} ${path}`);
    return error(404, 'Not found');
  }

  private ownedBy(id: string, wallet: string) {
    return this.executions.get(id)?.wallet.toLowerCase() === wallet.toLowerCase();
  }

  /** A read moves a funded execution one status along its script. */
  private play(kept: Kept) {
    if (!kept.funded || kept.script.length === 0) return;
    kept.wire.status = kept.script.shift()!;
    if (kept.wire.status === 'SUCCESS' || kept.wire.status === 'OPERATION_FAILED') kept.wire.transaction.solanaTxHash = SOLANA_TX;
  }

  private store(wallet: string, kind: Kind, body: any, script: Status[]): Kept {
    const n = ++this.created;
    const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const kept: Kept = { wire: this.draft(id, kind, body, n), wallet, kind, funded: false, script: [...script] };
    this.executions.set(id, kept);
    return kept;
  }

  /** What a create answers: the quote at today's market, the fee, and the message to sign. */
  private draft(id: string, kind: Kind, body: any, n = 0): FakeExecution {
    const priced = Array.isArray(body.steps) && body.steps.length > 0;
    // gas is estimated only for real steps, so a step-less round states no fee
    const networkFee = priced ? this.networkFee : undefined;
    const quote = kind === 'steps-only' ? this.stepsQuote(body) : this.quote(body.quote, kind === 'refund' ? BigInt(this.networkFee) : 0n);
    const depositAddress = kind === 'bridge-in' ? `0x${'d0'.repeat(18)}${n.toString(16).padStart(4, '0')}` : kind === 'refund' ? SOLANA_DEPOSIT : '';
    const message = JSON.stringify({ execution: id, intermediary: this.intermediary, steps: body.steps?.length ?? 0 });
    return {
      id,
      createdAt: this.now().toISOString(),
      status: 'CREATED',
      type: 'solana',
      ...(kind === 'steps-only' ? { executionMode: 'steps_only' as const } : {}),
      quote: { ...quote, depositAddress, depositMemo: null },
      details: {
        intermediaryAddress: this.intermediary ?? '',
        ...(networkFee ? { networkFee } : {}),
        messageSigned: false,
        signingStandard: 'erc191',
        payload: { standard: 'erc191', payload_json: message, payload_bytes_base64: Buffer.from(message).toString('base64') },
      },
      steps: body.steps ?? [],
      metadata: body.metadata,
      transaction: {},
    };
  }

  /** The bridge's quote. A Refund pays its fee out of the amount first. */
  private quote(request: any, fee: bigint) {
    const origin = tokenOf(request.originAsset);
    const destination = tokenOf(request.destinationAsset);
    if (!origin || !destination) throw new Error(`The fake Connect cannot price ${request.originAsset} → ${request.destinationAsset}`);
    const amount = BigInt(request.amount);
    const usd = (Number(amount - fee) / 10 ** origin.decimals) * origin.price;
    const gross = BigInt(Math.floor((usd / destination.price) * 10 ** destination.decimals));
    const amountOut = (gross * BigInt(10_000 - this.bridgeBps - this.moved)) / 10_000n;
    const minAmountOut = (amountOut * BigInt(10_000 - (request.slippageTolerance ?? 100))) / 10_000n;
    return { ...request, amount: request.amount, amountIn: request.amount, amountOut: String(amountOut), minAmountOut: String(minAmountOut) };
  }

  private stepsQuote(body: any) {
    return { amount: '0', amountIn: '0', amountOut: '0', minAmountOut: '0', destinationAsset: body.destinationAsset };
  }
}

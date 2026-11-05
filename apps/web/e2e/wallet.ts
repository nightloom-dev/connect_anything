import { expect, type Page } from '@playwright/test';

/** The EVM account of the mock wallet. Nothing checks its signatures: Connect is a fake too. */
export const WALLET = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
export const WALLET_NAME = 'E2E Wallet';
/** 65 well-formed bytes, r ‖ s ‖ v, as personal_sign returns them. */
export const SIGNATURE = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b`;
/** The hash of every transaction the wallet sends. */
export const TX_HASH = `0x${'ab'.repeat(32)}`;
const BASE = 8453;

type Held = 'personal_sign' | 'eth_sendTransaction';

type Control = {
  /** How many of the next signature requests answer 4001, as a person who clicks Reject. */
  rejectSignatures: number;
  rejectTransactions: number;
  calls: { method: string; params?: unknown }[];
  holds: Partial<Record<Held, boolean>>;
  waiting: Partial<Record<Held, () => void>>;
};

declare global {
  interface Window {
    __e2eWallet: Control;
  }
}

type Config = { address: string; chainId: number; name: string; signature: string; txHash: string };

/** An EIP-1193 provider, announced over EIP-6963. Runs in the page before any of its scripts, so it closes over nothing. */
function install({ address, chainId: startChain, name, signature, txHash }: Config) {
  if (window.top !== window) return;
  let chainId = startChain;
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const emit = (event: string, ...args: unknown[]) => listeners.get(event)?.forEach(listener => listener(...args));
  const control: Control = { rejectSignatures: 0, rejectTransactions: 0, calls: [], holds: {}, waiting: {} };
  const hex = (value: number | bigint) => `0x${BigInt(value).toString(16)}`;
  const word = (value: number | bigint) => `0x${BigInt(value).toString(16).padStart(64, '0')}`;
  const rejected = () => Object.assign(new Error('User rejected the request.'), { code: 4001 });
  // a held prompt stays open, as in a wallet nobody has answered yet, until the test releases it
  const prompt = (method: Held) =>
    control.holds[method]
      ? new Promise<void>(resolve => {
          control.waiting[method] = () => {
            delete control.waiting[method];
            resolve();
          };
        })
      : Promise.resolve();
  const receipt = (hash: string) => ({
    transactionHash: hash,
    transactionIndex: '0x0',
    blockHash: `0x${'cd'.repeat(32)}`,
    blockNumber: hex(20_000_000),
    from: address,
    to: address,
    cumulativeGasUsed: hex(21_000),
    gasUsed: hex(21_000),
    effectiveGasPrice: hex(1_000_000_000),
    contractAddress: null,
    logs: [],
    logsBloom: `0x${'00'.repeat(256)}`,
    status: '0x1',
    type: '0x2',
  });

  const provider = {
    isMetaMask: false,
    async request({ method, params }: { method: string; params?: any[] }): Promise<unknown> {
      control.calls.push({ method, params });
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return [address];
        case 'eth_chainId':
          return hex(chainId);
        case 'net_version':
          return String(chainId);
        case 'wallet_switchEthereumChain': {
          const next = parseInt(params![0].chainId, 16);
          if (next !== chainId) {
            chainId = next;
            emit('chainChanged', hex(chainId));
          }
          return null;
        }
        case 'wallet_addEthereumChain':
          return null;
        case 'wallet_requestPermissions':
        case 'wallet_getPermissions':
          return [{ parentCapability: 'eth_accounts' }];
        case 'wallet_revokePermissions':
          return null;
        case 'personal_sign':
        case 'eth_sign':
        case 'eth_signTypedData_v4':
          await prompt('personal_sign');
          if (control.rejectSignatures > 0) {
            control.rejectSignatures--;
            throw rejected();
          }
          return signature;
        case 'eth_sendTransaction':
          await prompt('eth_sendTransaction');
          if (control.rejectTransactions > 0) {
            control.rejectTransactions--;
            throw rejected();
          }
          return txHash;
        case 'eth_getBalance':
          return hex(10n ** 20n);
        case 'eth_call': {
          const data: string = params?.[0]?.data ?? params?.[0]?.input ?? '';
          // decimals(), then balanceOf and allowance, which get plenty
          return data.startsWith('0x313ce567') ? word(6) : word(10n ** 30n);
        }
        case 'eth_estimateGas':
          return hex(60_000);
        case 'eth_gasPrice':
        case 'eth_maxPriorityFeePerGas':
          return hex(1_000_000_000);
        case 'eth_blockNumber':
          return hex(20_000_000);
        case 'eth_getTransactionCount':
          return '0x1';
        case 'eth_getBlockByNumber':
          return { number: hex(20_000_000), baseFeePerGas: hex(1_000_000_000), timestamp: hex(Math.floor(Date.now() / 1000)), transactions: [] };
        case 'eth_getTransactionReceipt':
          return receipt(params![0]);
        case 'eth_getTransactionByHash':
          return { hash: params![0], from: address, to: address, value: '0x0', input: '0x', nonce: '0x1', blockNumber: hex(20_000_000), blockHash: `0x${'cd'.repeat(32)}`, transactionIndex: '0x0', type: '0x2', chainId: hex(chainId) };
        default:
          throw Object.assign(new Error(`The mock wallet does not support ${method}`), { code: 4200 });
      }
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
      return provider;
    },
    removeListener(event: string, listener: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(listener);
      return provider;
    },
  };
  Object.assign(provider, { off: provider.removeListener });
  window.__e2eWallet = control;

  const icon = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#3b5bdb"/></svg>')}`;
  const info = { uuid: '4f1c2b0e-0000-4000-8000-00000000e2e0', name, rdns: 'dev.connect-anything.e2e', icon };
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }));
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
}

/** A held wallet prompt: `reached` once the app asked for it, `release` answers it. */
export type HeldPrompt = { reached: () => Promise<void>; release: () => Promise<void> };

/**
 * The mock EVM wallet of one page. It is installed before the page loads, and AppKit lists it in its modal like any
 * EIP-6963 wallet. Its counters live in the page, so a reload resets them.
 */
export class MockWallet {
  readonly address = WALLET;
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async install() {
    await this.page.addInitScript(install, { address: WALLET, chainId: BASE, name: WALLET_NAME, signature: SIGNATURE, txHash: TX_HASH });
  }

  /** Clicks the page's own button, picks this wallet in the AppKit modal and waits for the page to show the address. */
  async connect() {
    await this.page.getByRole('button', { name: 'Connect EVM wallet' }).click();
    await this.page.getByRole('button', { name: new RegExp(WALLET_NAME) }).click();
    await expect(this.page.getByText(WALLET, { exact: true })).toBeVisible();
  }

  /** The next `count` signature prompts are rejected (code 4001). */
  async rejectSignatures(count = 1) {
    await this.page.evaluate(count => (window.__e2eWallet.rejectSignatures += count), count);
  }

  /** The next `count` transaction prompts are rejected (code 4001). */
  async rejectTransactions(count = 1) {
    await this.page.evaluate(count => (window.__e2eWallet.rejectTransactions += count), count);
  }

  /** Keeps the next prompts of this kind open until `release`, to see what the page shows while the wallet waits. */
  async hold(method: Held): Promise<HeldPrompt> {
    await this.page.evaluate(method => (window.__e2eWallet.holds[method] = true), method);
    return {
      reached: async () => void (await this.page.waitForFunction(method => !!window.__e2eWallet.waiting[method], method)),
      release: async () =>
        this.page.evaluate(method => {
          window.__e2eWallet.holds[method] = false;
          window.__e2eWallet.waiting[method]?.();
        }, method),
    };
  }

  /** What the app asked the wallet, in order, optionally of one method. */
  async calls(method?: string) {
    const calls = await this.page.evaluate(() => window.__e2eWallet.calls);
    return method ? calls.filter(call => call.method === method) : calls;
  }
}

/** The Solana account of the Solana mock wallet. */
export const SOLANA_WALLET = 'GsbwXfJraMomNxBcjYLcG3mxkBUiyWXAB32fGbSMQRdW';
export const SOLANA_WALLET_NAME = 'E2E Solana Wallet';

/** A Solana wallet of the Wallet Standard, which the Solana adapter of AppKit lists. It connects and signs nothing. */
function installSolana({ address, name }: { address: string; name: string }) {
  if (window.top !== window) return;
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = 0n;
  for (const char of address) value = value * 58n + BigInt(ALPHABET.indexOf(char));
  const publicKey = new Uint8Array(32);
  for (let at = 31; at >= 0; at--, value >>= 8n) publicKey[at] = Number(value & 0xffn);
  const chains = ['solana:mainnet', 'solana:devnet', 'solana:testnet'] as const;
  const features = ['solana:signAndSendTransaction', 'solana:signTransaction', 'solana:signMessage'] as const;
  const account = Object.freeze({ address, publicKey, chains, features });
  let accounts: (typeof account)[] = [];
  const listeners = new Set<(properties: { accounts: unknown[] }) => void>();
  const changed = () => listeners.forEach(listener => listener({ accounts }));
  const refused = async () => {
    throw Object.assign(new Error('The Solana mock wallet signs nothing.'), { code: 4001 });
  };
  const wallet = {
    version: '1.0.0',
    name,
    icon: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#9945ff"/></svg>')}`,
    chains,
    get accounts() {
      return accounts;
    },
    features: {
      'standard:connect': {
        version: '1.0.0',
        connect: async () => {
          accounts = [account];
          changed();
          return { accounts };
        },
      },
      'standard:disconnect': {
        version: '1.0.0',
        disconnect: async () => {
          accounts = [];
          changed();
        },
      },
      'standard:events': {
        version: '1.0.0',
        on: (_event: 'change', listener: (properties: { accounts: unknown[] }) => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      'solana:signAndSendTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy', 0], signAndSendTransaction: refused },
      'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy', 0], signTransaction: refused },
      'solana:signMessage': { version: '1.0.0', signMessage: refused },
    },
  };
  const register = ({ register }: { register: (wallet: unknown) => void }) => register(wallet);
  window.addEventListener('wallet-standard:app-ready', event => register((event as CustomEvent).detail));
  window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: register }));
}

/** A Solana wallet for the page, to see what the page does with a wallet that is not EVM. */
export class MockSolanaWallet {
  readonly address = SOLANA_WALLET;
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async install() {
    await this.page.addInitScript(installSolana, { address: SOLANA_WALLET, name: SOLANA_WALLET_NAME });
  }

  async connect() {
    await this.page.getByRole('button', { name: 'Connect EVM wallet' }).click();
    await this.page.getByRole('button', { name: new RegExp(SOLANA_WALLET_NAME) }).click();
    await expect(this.page.getByText(SOLANA_WALLET, { exact: true })).toBeVisible();
  }
}

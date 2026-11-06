import type { Route } from '@playwright/test';

// Everything the page asks of the internet besides the app's own server and Connect: Reown AppKit (config, wallet
// list, images, fonts, identity, telemetry), web fonts and public RPCs. Each answer is the smallest one that keeps the
// page quiet, so a test runs offline and the console stays clean.

const PIXEL = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

type Rpc = { jsonrpc?: string; id?: unknown; method?: string };

function rpcResult(method = '') {
  switch (method) {
    case 'eth_chainId':
      return '0x1';
    case 'net_version':
      return '1';
    case 'eth_blockNumber':
      return '0x1312d00';
    case 'eth_getBalance':
    case 'eth_getTransactionCount':
      return '0x0';
    case 'eth_call':
      return '0x';
    case 'getHealth':
      return 'ok';
    case 'getSlot':
    case 'getBlockHeight':
      return 1;
    case 'getBalance':
      return { context: { slot: 1 }, value: 0 };
    case 'getLatestBlockhash':
      return { context: { slot: 1 }, value: { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1 } };
    default:
      return null;
  }
}

/** Answers a request to a third party, or returns false for one nobody expected. */
export async function stubExternal(route: Route, url: URL): Promise<boolean> {
  const request = route.request();
  const { hostname: host, pathname: path } = url;
  const reply = async (options: Parameters<Route['fulfill']>[0]) => {
    await route.fulfill(options);
    return true;
  };

  if (host === 'api.web3modal.org' || host === 'api.web3modal.com') {
    // `features: null` keeps AppKit's local options, so it neither warns nor turns on remote features
    if (path === '/appkit/v1/config') return reply({ json: { features: null } });
    if (path === '/appkit/v1/project-limits') return reply({ json: { planLimits: { tier: 'none', isAboveMauLimit: false, isAboveRpcLimit: false } } });
    if (path === '/getWallets') return reply({ json: { count: 0, data: [] } });
    if (/image/i.test(path)) return reply({ body: PIXEL, contentType: 'image/svg+xml' });
    return reply({ json: {} });
  }
  if (host === 'pulse.walletconnect.org' || host === 'pulse.walletconnect.com') return reply({ status: 204 });
  // an empty font only costs a decoding warning, and the page falls back to its own fonts
  if (host === 'fonts.reown.com' || host === 'fonts.gstatic.com') return reply({ body: '', contentType: 'font/woff2' });
  if (host === 'fonts.googleapis.com') return reply({ body: '', contentType: 'text/css' });
  if (host === 'rpc.walletconnect.org' && path.startsWith('/v1/identity')) return reply({ json: { name: null, avatar: null } });
  // WalletConnect's Verify, asked for an attestation of this origin when AppKit gets as far as a WalletConnect pairing:
  // rarely, as the relay never answers here (seen once in a screenshot run). An empty answer is "not verified".
  if (host === 'verify.walletconnect.org' || host === 'verify.walletconnect.com') return reply({ status: 204 });

  // a JSON-RPC call to a chain, from AppKit or a wallet library
  if (request.method() === 'POST') {
    let body: Rpc | Rpc[] | undefined;
    try {
      body = request.postDataJSON();
    } catch {
      body = undefined;
    }
    const one = (call: Rpc) => ({ jsonrpc: '2.0', id: call.id ?? null, result: rpcResult(call.method) });
    if (Array.isArray(body)) return reply({ json: body.map(one) });
    if (body?.jsonrpc) return reply({ json: one(body) });
  }
  return false;
}

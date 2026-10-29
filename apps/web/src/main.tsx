import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createIntentsConnectApi, type ExecutionPreview } from '@aurora-is-near/intents-connect';
import { IntentsConnectProvider, useExecution } from '@aurora-is-near/intents-connect/react';
import { AppKitProvider, useIntentsConnectWallet } from '@aurora-is-near/intents-connect-wallet/connect/appkit';
import { supplyPlan } from './kamino';

const api = createIntentsConnectApi({
  baseUrl: import.meta.env.CONNECT_API_URL,
  apiKeyProxyUrl: `${location.origin}/api/intents-connect`,
});

const usdc = (atomic?: string | null) => (atomic == null ? '–' : (Number(atomic) / 1e6).toFixed(6));
const LAST = 'lastExecutionId';

function Supply() {
  const exec = useExecution({
    onEvent: e => { if (e.type === 'created') try { localStorage.setItem(LAST, e.executionId); } catch {} },
  });
  const [amount, setAmount] = useState('5');
  const [preview, setPreview] = useState<ExecutionPreview | null>(null);
  const [error, setError] = useState('');
  const attempt = (f: () => Promise<unknown>) => async () => {
    setError('');
    try { await f(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const last = (() => { try { return localStorage.getItem(LAST); } catch { return null; } })();

  return (
    <section>
      <h2>Supply USDC to Kamino from Base</h2>
      <label>
        USDC on Base <input value={amount} onChange={e => { setAmount(e.target.value); setPreview(null); }} disabled={exec.isBusy} />
      </label>
      <button disabled={exec.isBusy} onClick={attempt(async () => setPreview(await exec.preview(supplyPlan(String(Math.round(Number(amount) * 1e6))))))}>
        Preview
      </button>
      {preview && (
        <p>
          Network fee {usdc(preview.execution.details.networkFee)} USDC · supplied to Kamino {usdc(preview.spendable)} USDC{' '}
          <button disabled={exec.isBusy} onClick={attempt(() => exec.run(preview.plan))}>Sign and supply</button>
        </p>
      )}
      <p>Phase: {exec.phase} · status: {exec.status ?? '–'}</p>
      {exec.executionId && <p>Execution: <code>{exec.executionId}</code></p>}
      {exec.depositTxHash && <p>Deposit: <a href={`https://basescan.org/tx/${exec.depositTxHash}`} target="_blank">{exec.depositTxHash}</a></p>}
      {exec.recovery?.kind === 'retry-transfer' && <button onClick={attempt(() => exec.retryDeposit())}>Retry deposit</button>}
      {exec.recovery?.kind === 'resume-or-cancel' && (
        <>
          <button onClick={attempt(() => exec.resume(exec.recovery!.executionId))}>Resume</button>
          <button onClick={attempt(() => exec.cancel(exec.recovery!.executionId))}>Cancel</button>
        </>
      )}
      {!exec.isBusy && !exec.executionId && last && <button onClick={attempt(() => exec.resume(last))}>Resume {last.slice(0, 8)}…</button>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {exec.execution && <pre>{JSON.stringify(exec.execution, null, 2)}</pre>}
    </section>
  );
}

function App() {
  const { wallet, address, isConnected, connect, disconnect } = useIntentsConnectWallet();
  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 720, margin: '2rem auto', padding: '0 16px' }}>
      <h1>Connect Anything</h1>
      <button onClick={() => (isConnected ? disconnect() : connect())}>{isConnected ? `Disconnect ${address}` : 'Connect wallet'}</button>
      <IntentsConnectProvider api={api} wallet={wallet}>
        <Supply />
      </IntentsConnectProvider>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <AppKitProvider appName="Connect Anything" themeMode="light">
    <App />
  </AppKitProvider>,
);

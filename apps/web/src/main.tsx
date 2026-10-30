import { createRoot } from 'react-dom/client';
import { createIntentsConnectApi } from '@aurora-is-near/intents-connect';
import { IntentsConnectProvider } from '@aurora-is-near/intents-connect/react';
import { AppKitProvider, useIntentsConnectWallet } from '@aurora-is-near/intents-connect-wallet/connect/appkit';
import { Builder } from './builder.tsx';
import { retry503 } from './connect.ts';
import { SharedRecipe } from './execute.tsx';
import { Rescue } from './rescue.tsx';
import { Boundary, Notice } from './ui.tsx';
import './styles.css';

const api = createIntentsConnectApi({
  baseUrl: import.meta.env.CONNECT_API_URL,
  apiKeyProxyUrl: `${location.origin}/api/intents-connect`,
  fetch: retry503((input, init) => fetch(input, init)),
  timeout: 60_000, // the SDK's 30 s spans a create and its retries together
});

function Page() {
  const { pathname } = location;
  const shared = /^\/r\/([^/]+)\/?$/.exec(pathname);
  if (pathname === '/') return <Builder />;
  if (shared) return <SharedRecipe id={shared[1]} />;
  if (pathname === '/kamino') return <Rescue />;
  return (
    <Notice kind="error">
      There is no such page. <a href="/">Start here</a>
    </Notice>
  );
}

function App() {
  const { wallet } = useIntentsConnectWallet();
  return (
    <IntentsConnectProvider api={api} wallet={wallet}>
      <header>
        <h1>
          <a href="/">Connect Anything</a>
        </h1>
        <p>
          An instruction of an Anchor program on Solana, paid with one signature from an EVM chain. <a href="/kamino">Repay a Kamino debt</a>
        </p>
      </header>
      <main>
        <Boundary>
          <Page />
        </Boundary>
      </main>
    </IntentsConnectProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <AppKitProvider appName="Connect Anything" themeMode="light">
    <App />
  </AppKitProvider>,
);

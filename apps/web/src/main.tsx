import { createRoot } from 'react-dom/client';
import { createIntentsConnectApi } from '@aurora-is-near/intents-connect';
import { IntentsConnectProvider } from '@aurora-is-near/intents-connect/react';
import { AppKitProvider, useIntentsConnectWallet } from '@aurora-is-near/intents-connect-wallet/connect/appkit';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import { AppKitTheme } from './app/AppKitTheme.tsx';
import { Routes } from './app/routes.tsx';
import { Shell } from './app/Shell.tsx';
import { retry503 } from './connect.ts';
import './styles/index.css';

const api = createIntentsConnectApi({
  baseUrl: import.meta.env.CONNECT_API_URL,
  apiKeyProxyUrl: `${location.origin}/api/intents-connect`,
  fetch: retry503((input, init) => fetch(input, init)),
  timeout: 60_000, // the SDK's 30 s spans a create and its retries together
});

function App() {
  const { wallet } = useIntentsConnectWallet();
  return (
    <IntentsConnectProvider api={api} wallet={wallet}>
      <Shell>
        <Routes />
      </Shell>
    </IntentsConnectProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <AppKitProvider appName="Connect Anything" themeMode="dark">
    <AppKitTheme />
    <App />
  </AppKitProvider>,
);

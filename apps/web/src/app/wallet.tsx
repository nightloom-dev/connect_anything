import type { ReactNode } from 'react';
import { createIntentsConnectApi } from '@aurora-is-near/intents-connect';
import { IntentsConnectProvider } from '@aurora-is-near/intents-connect/react';
import { AppKitProvider, useIntentsConnectWallet } from '@aurora-is-near/intents-connect-wallet/connect/appkit';
import { retry503 } from '../connect.ts';
import { AppKitNetwork } from './AppKitNetwork.tsx';
import { AppKitTheme } from './AppKitTheme.tsx';

// The wallet code: Reown AppKit, its adapters and the Intents Connect SDK, most of the JavaScript of the app. Root loads
// this module after the first paint, or at once on a page that pays, so the landing page draws without waiting for it.
// The providers and their arguments are the ones main.tsx mounted before; only where and when they mount has changed.

export { WalletButton } from './WalletButton.tsx';

const api = createIntentsConnectApi({
  baseUrl: import.meta.env.CONNECT_API_URL,
  apiKeyProxyUrl: `${location.origin}/api/intents-connect`,
  fetch: retry503((input, init) => fetch(input, init)),
  timeout: 60_000, // the SDK's 30 s spans a create and its retries together
});

function App({ children }: { children: ReactNode }) {
  const { wallet } = useIntentsConnectWallet();
  return (
    <IntentsConnectProvider api={api} wallet={wallet}>
      {children}
    </IntentsConnectProvider>
  );
}

/** AppKit and Intents Connect, around the header's wallet button and every page that pays. Mounted once. */
export function WalletProviders({ children }: { children: ReactNode }) {
  return (
    <AppKitProvider appName="Connect Anything" themeMode="dark">
      <AppKitTheme />
      <AppKitNetwork />
      <App>{children}</App>
    </AppKitProvider>
  );
}

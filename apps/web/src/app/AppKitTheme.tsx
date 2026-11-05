import { useContext, useEffect } from 'react';
import { AppKitContext } from '@aurora-is-near/intents-connect-wallet/connect/appkit';

// Reown's modal in the app's accent, type and corners. Its colours come from themeMode="dark", mixed a little toward the page.
const THEME = {
  '--w3m-accent': '#5560ee',
  '--w3m-color-mix': '#0b0d12',
  '--w3m-color-mix-strength': 25,
  '--w3m-font-family': "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif",
  '--w3m-border-radius-master': '2px',
} as const;

/** AppKit is created in the provider's effect, so the theme goes on once the instance is there. */
export function AppKitTheme() {
  const appKit = useContext(AppKitContext)?.appKit;
  useEffect(() => {
    appKit?.setThemeVariables(THEME);
  }, [appKit]);
  return null;
}

import { useContext, useEffect } from 'react';
import { AppKitContext } from '@aurora-is-near/intents-connect-wallet/connect/appkit';

// Reown's modal in the app's cobalt, type and square corners. Its colours come from themeMode="light", mixed a little
// toward the ink of the page.
const THEME = {
  '--w3m-accent': '#1F3FD1',
  '--w3m-color-mix': '#0E1A2B',
  '--w3m-color-mix-strength': 6,
  '--w3m-font-family': "'IBM Plex Sans Variable', 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
  '--w3m-border-radius-master': '1px',
} as const;

/** AppKit is created in the provider's effect, so the theme goes on once the instance is there. */
export function AppKitTheme() {
  const appKit = useContext(AppKitContext)?.appKit;
  useEffect(() => {
    appKit?.setThemeVariables(THEME);
  }, [appKit]);
  return null;
}

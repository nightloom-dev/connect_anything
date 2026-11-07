import { createRoot } from 'react-dom/client';
import '@fontsource-variable/ibm-plex-sans/wght.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import { Root } from './app/Root.tsx';
import './styles/index.css';

// The shell and the page draw first. The wallet providers (AppKit, Intents Connect) live in app/wallet.tsx, and
// app/Root.tsx decides when they load and where they mount.
//
// What this file reaches without a dynamic import (the shell, the landing page, the 404) imports each ui primitive from
// its own file, not from ui/index.ts: the barrel reaches every primitive, and through ui/chains.ts connect.ts and the
// SDK, which would all land in the first load again. The landing smoke test checks it.
createRoot(document.getElementById('root')!).render(<Root />);

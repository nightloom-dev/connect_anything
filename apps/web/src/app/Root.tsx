import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { toast } from '../ui/Toaster.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { PageSkeleton } from './PageSkeleton.tsx';
import { PublicRoutes, useWalletPage, WalletRoutes } from './routes.tsx';
import { Shell } from './Shell.tsx';
import { WalletPlaceholder } from './WalletPlaceholder.tsx';

// The wallet code (wallet.tsx: AppKit, its adapters, the SDK) is most of the app's JavaScript, and the landing page needs
// none of it to draw. So the shell and the page come first, and the wallet code loads right after the first paint, at
// once on a page that pays, or as soon as someone reaches for the wallet button.
//
// Its providers mount beside the shell, not around it: mounting them around it later would remount the page under
// them, with its scroll, focus and the hero's animation. Whatever needs them sits in a portal inside the providers:
// the header's wallet button and the pages that pay.

type Wallet = typeof import('./wallet.tsx');

let loading: Promise<Wallet> | undefined;
/** One import for everyone; a failed one is forgotten, so the next attempt asks the network again. */
const loadWallet = () =>
  (loading ??= import('./wallet.tsx').catch(error => {
    loading = undefined;
    throw error;
  }));

const whenIdle = (run: () => void, timeout: number) => {
  // Safari has no requestIdleCallback
  if (typeof window.requestIdleCallback !== 'function') {
    const handle = setTimeout(run, 200);
    return () => clearTimeout(handle);
  }
  const handle = window.requestIdleCallback(run, { timeout });
  return () => window.cancelIdleCallback(handle);
};

function Failed({ error }: { error: Error }): never {
  // the page's error boundary shows it, with Reload
  throw error;
}

export function Root() {
  const [location] = useLocation();
  const walletPage = useWalletPage();
  const needsWallet = !!walletPage;
  const [wallet, setWallet] = useState<Wallet>();
  const [failure, setFailure] = useState<Error>();
  // the placeholder was clicked: connect as soon as AppKit is up
  const [pending, setPending] = useState(false);
  const placeholderFocused = useRef(false);
  const [walletSlot, setWalletSlot] = useState<HTMLElement | null>(null);
  const [pageSlot, setPageSlot] = useState<HTMLElement | null>(null);

  const load = useCallback(() => {
    setFailure(undefined);
    return loadWallet().then(setWallet, (error: Error) => {
      setFailure(error);
      throw error;
    });
  }, []);

  // a page that pays waits for the wallet code, so it starts now, with the page's own code alongside; any other page
  // asks for it once the browser is idle
  useEffect(() => {
    if (wallet) return;
    if (walletPage) {
      load().catch(() => {});
      // the page's lazy import gets the same module, and shows its error itself
      walletPage.load().catch(() => {});
      return;
    }
    return whenIdle(() => void load().catch(() => {}), 3000);
  }, [walletPage, wallet, load]);

  const connect = () => {
    setPending(true);
    load().catch(() => {
      setPending(false);
      toast.error('Could not load the wallet', { description: 'Check your connection, then reload the page.' });
    });
  };

  const ready = !!wallet && !!walletSlot && !!pageSlot;
  const placeholder = ready ? null : (
    <WalletPlaceholder
      pending={pending}
      onIntent={() => void loadWallet().catch(() => {})}
      onConnect={connect}
      onFocus={() => (placeholderFocused.current = true)}
      onBlur={() => (placeholderFocused.current = false)}
    />
  );

  let page;
  if (!needsWallet) page = <PublicRoutes />;
  else if (ready) page = null;
  else if (failure) page = <Failed error={failure} />;
  else page = <PageSkeleton path={walletPage.path} />;

  return (
    <>
      <Shell wallet={placeholder} walletSlot={setWalletSlot} pageSlot={setPageSlot} fills={walletPage?.fills} bleed={location === '/'}>
        {page}
      </Shell>
      {ready && (
        <wallet.WalletProviders>
          {createPortal(<wallet.WalletButton connectNow={pending} onConnectStarted={() => setPending(false)} focusOnMount={placeholderFocused.current} />, walletSlot)}
          {createPortal(
            <ErrorBoundary resetKey={location}>
              <WalletRoutes />
            </ErrorBoundary>,
            pageSlot,
          )}
        </wallet.WalletProviders>
      )}
    </>
  );
}

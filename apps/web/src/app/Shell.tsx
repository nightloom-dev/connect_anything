import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { cn } from '../ui/cn.ts';
import { Toaster } from '../ui/Toaster.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { Footer } from './Footer.tsx';
import { Header } from './Header.tsx';

type ShellProps = {
  /** A page that needs no wallet, or what stands in for one that does while the wallet code loads. */
  children: ReactNode;
  /** In the header's wallet place until the real button arrives: the placeholder. */
  wallet?: ReactNode;
  /** Where the real wallet button goes, from inside the wallet providers. */
  walletSlot?: (element: HTMLElement | null) => void;
  /** Where a page that needs the wallet goes, from inside the wallet providers. */
  pageSlot?: (element: HTMLElement | null) => void;
  /** The page will fill more than a screen: the footer starts below the first one (WalletPage.fills). */
  fills?: boolean;
  /** The page lays out its own width, edge to edge: the landing page, whose sheets span the window. */
  bleed?: boolean;
};

/**
 * Header, the page, footer and toasts. A page that throws is caught here, and the next route clears it. It never
 * remounts: the wallet providers render beside it, into the two slots (see Root).
 */
export function Shell({ children, wallet, walletSlot, pageSlot, fills, bleed }: ShellProps) {
  const [location] = useLocation();
  // a new page starts at its top, as it would after a full load (braces: scrollTo returns a promise in newer browsers)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-accent-solid px-3 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <Header wallet={wallet} walletSlot={walletSlot} />
      <main
        id="main"
        tabIndex={-1}
        // 3.5625rem: the header, h-14 and its 1 px border; lvh, so that the footer stays off the screen when a phone's
        // address bar hides
        className={cn(
          'w-full flex-1 outline-none',
          !bleed && 'mx-auto max-w-content px-4 pt-8 pb-16 sm:px-6 sm:pt-10',
          fills && 'min-h-[calc(100lvh-3.5625rem)]',
        )}
      >
        <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>
        <div ref={pageSlot} className="contents" />
      </main>
      <Footer />
      <Toaster />
    </div>
  );
}

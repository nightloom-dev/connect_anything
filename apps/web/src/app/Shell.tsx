import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { Toaster } from '../ui/index.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { Footer } from './Footer.tsx';
import { Header } from './Header.tsx';

/** Header, the page, footer and toasts. A page that throws is caught here, and the next route clears it. */
export function Shell({ children }: { children: ReactNode }) {
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
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(52rem_22rem_at_50%_-6rem,color-mix(in_oklab,var(--color-accent)_16%,transparent),transparent_70%)]" />
      <Header />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-content flex-1 px-4 pt-8 pb-16 outline-none sm:px-6 sm:pt-10">
        <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>
      </main>
      <Footer />
      <Toaster />
    </div>
  );
}

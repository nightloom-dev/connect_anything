import { lazy, Suspense, type ReactNode } from 'react';
import { matchRoute, Route, Switch, useLocation, useRouter } from 'wouter';
import { Landing } from '../pages/Landing.tsx';
import { NotFound } from '../pages/NotFound.tsx';
import { Skeleton } from '../ui/Skeleton.tsx';

// each feature's page.tsx owns its title and layout, so a redesign of one page does not touch this file
const loadBuilder = () => import('../features/builder/page.tsx');
const loadKamino = () => import('../features/kamino/page.tsx');
const loadShared = () => import('../features/run/shared-page.tsx');
const loadDevStates = () => import('../pages/DevStates.tsx');
const BuilderPage = lazy(loadBuilder);
const KaminoPage = lazy(loadKamino);
const SharedPage = lazy(loadShared);
// the gallery of every state is a tool for building the UI, and the production bundle leaves it out
const DevStates = import.meta.env.DEV ? lazy(loadDevStates) : null;
// the 1200 × 630 picture that links unfurl into, rendered to public/og.png from here
const OgImage = import.meta.env.DEV ? lazy(() => import('../pages/OgImage.tsx')) : null;

// A status, so a screen reader hears that the page is on its way: a div with no role may not carry a label (axe:
// aria-prohibited-attr), and aria-busy would keep the region quiet until it is gone.
export function PageSkeleton() {
  return (
    <div role="status" className="mx-auto flex max-w-[52rem] flex-col gap-6">
      <span className="sr-only">Loading the page…</span>
      <Skeleton className="h-8 w-64" />
      <Skeleton lines={2} className="max-w-xl" />
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <Skeleton className="h-5 w-32" />
        <Skeleton lines={3} />
      </div>
    </div>
  );
}

type WalletPage = {
  path: string;
  /** Fetches the page's code, so that it can come alongside the wallet code instead of after it. */
  load: () => Promise<unknown>;
  render: (params: Record<string, string | undefined>) => ReactNode;
};

/** The pages that pay, or may: they render inside the wallet providers, once the wallet code has loaded (Root). */
const WALLET_PAGES: WalletPage[] = [
  { path: '/build', load: loadBuilder, render: () => <BuilderPage /> },
  { path: '/kamino', load: loadKamino, render: () => <KaminoPage /> },
  { path: '/r/:id', load: loadShared, render: ({ id }) => <SharedPage id={id!} /> },
  // the gallery shows the screens of every feature, which may read the wallet
  ...(DevStates ? [{ path: '/dev/states', load: loadDevStates, render: () => <DevStates /> }] : []),
];

/** The page at the current path if it needs the wallet providers. */
export function useWalletPage() {
  const { parser } = useRouter();
  const [location] = useLocation();
  return WALLET_PAGES.find(({ path }) => matchRoute(parser, path, location)[0]);
}

/** The pages that need no wallet: the landing page and the 404. They draw at once, before the wallet code is there. */
export function PublicRoutes() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Switch>
        <Route path="/">
          <Landing />
        </Route>
        {OgImage && (
          <Route path="/dev/og">
            <OgImage />
          </Route>
        )}
        <Route>
          <NotFound />
        </Route>
      </Switch>
    </Suspense>
  );
}

/** The pages that need the wallet, inside its providers. Any other path renders nothing here. */
export function WalletRoutes() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Switch>
        {WALLET_PAGES.map(({ path, render }) => (
          <Route key={path} path={path}>
            {params => render(params)}
          </Route>
        ))}
      </Switch>
    </Suspense>
  );
}

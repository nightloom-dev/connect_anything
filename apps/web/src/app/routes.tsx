import { lazy, Suspense, type ReactNode } from 'react';
import { matchRoute, Route, Switch, useLocation, useRouter } from 'wouter';
import { Landing } from '../pages/Landing.tsx';
import { NotFound } from '../pages/NotFound.tsx';
import { PageSkeleton } from './PageSkeleton.tsx';

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

type WalletPage = {
  path: string;
  /** Fetches the page's code, so that it can come alongside the wallet code instead of after it. */
  load: () => Promise<unknown>;
  render: (params: Record<string, string | undefined>) => ReactNode;
  /**
   * The page fills more than a screen once it is in, but passes through shorter states that cannot know how tall it
   * will be: the footer starts below the first screen, so that it never jumps into view and out again.
   */
  fills?: true;
};

/** The pages that pay, or may: they render inside the wallet providers, once the wallet code has loaded (Root). */
const WALLET_PAGES: WalletPage[] = [
  { path: '/build', load: loadBuilder, render: () => <BuilderPage /> },
  { path: '/kamino', load: loadKamino, render: () => <KaminoPage /> },
  // its skeleton, then the shared page's own while the recipe loads, then the recipe or a link that leads nowhere
  { path: '/r/:id', load: loadShared, render: ({ id }) => <SharedPage id={id!} />, fills: true },
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
  const page = useWalletPage();
  return (
    <Suspense fallback={<PageSkeleton path={page?.path} />}>
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

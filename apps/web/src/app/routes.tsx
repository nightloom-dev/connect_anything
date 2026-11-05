import { lazy, Suspense } from 'react';
import { Route, Switch } from 'wouter';
import { NotFound } from '../pages/NotFound.tsx';
import { Skeleton } from '../ui/index.ts';

// each feature's page.tsx owns its title and layout, so a redesign of one page does not touch this file
const BuilderPage = lazy(() => import('../features/builder/page.tsx'));
const KaminoPage = lazy(() => import('../features/kamino/page.tsx'));
const SharedPage = lazy(() => import('../features/run/shared-page.tsx'));
// the gallery of every state is a tool for building the UI, and the production bundle leaves it out
const DevStates = import.meta.env.DEV ? lazy(() => import('../pages/DevStates.tsx')) : null;

function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the page" className="mx-auto flex max-w-[52rem] flex-col gap-6">
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

export function Routes() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Switch>
        {/* / is the builder until the landing page takes it */}
        <Route path="/">
          <BuilderPage />
        </Route>
        <Route path="/build">
          <BuilderPage />
        </Route>
        <Route path="/kamino">
          <KaminoPage />
        </Route>
        <Route path="/r/:id">{({ id }) => <SharedPage id={id} />}</Route>
        {DevStates && (
          <Route path="/dev/states">
            <DevStates />
          </Route>
        )}
        <Route>
          <NotFound />
        </Route>
      </Switch>
    </Suspense>
  );
}

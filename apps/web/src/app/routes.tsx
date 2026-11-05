import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Switch } from 'wouter';
import { NotFound } from '../pages/NotFound.tsx';
import { Skeleton } from '../ui/index.ts';
import { usePageTitle } from './title.ts';

const Builder = lazy(() => import('../builder.tsx').then(module => ({ default: module.Builder })));
const Rescue = lazy(() => import('../rescue.tsx').then(module => ({ default: module.Rescue })));
const SharedRecipe = lazy(() => import('../execute.tsx').then(module => ({ default: module.SharedRecipe })));

/** A screen from before the redesign, in the column and with the element styles it was written for. */
function Legacy({ title, children }: { title: string; children: ReactNode }) {
  usePageTitle(title);
  return <div className="legacy">{children}</div>;
}

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
          <Legacy title="Build">
            <Builder />
          </Legacy>
        </Route>
        <Route path="/build">
          <Legacy title="Build">
            <Builder />
          </Legacy>
        </Route>
        <Route path="/kamino">
          <Legacy title="Rescue Kamino">
            <Rescue />
          </Legacy>
        </Route>
        <Route path="/r/:id">
          {({ id }) => (
            <Legacy title="Shared recipe">
              <SharedRecipe id={id} />
            </Legacy>
          )}
        </Route>
        <Route>
          <NotFound />
        </Route>
      </Switch>
    </Suspense>
  );
}

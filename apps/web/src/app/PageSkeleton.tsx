import type { ReactNode } from 'react';
import { useSearch } from 'wouter';
import { cn } from '../ui/cn.ts';
import { Skeleton } from '../ui/Skeleton.tsx';

// What a page that pays shows while its code, or the wallet code before it, is on the way: grey shapes where its blocks
// will be, about as tall, so that nothing jumps when it comes and the footer stays below a page that is longer than the
// screen. The sizes are those of the pages at 1440, 820 and 390 px wide. This file is in the first load, so it imports
// each primitive from its own file.

/** A line of text `line` tall, as a bar `bar` tall; `className` sizes the bar's width. */
function Line({ line = 'h-5', bar = 'h-3', className }: { line?: string; bar?: string; className?: string }) {
  return (
    <span className={cn('flex items-center', line)}>
      <Skeleton className={cn(bar, className)} />
    </span>
  );
}

/** The edge of a card, with what it holds as grey shapes. */
function Frame({ className, children }: { className?: string; children?: ReactNode }) {
  return <div className={cn('flex min-w-0 flex-col rounded-lg border border-border bg-surface', className)}>{children}</div>;
}

/** /kamino: its heading and the wallet field, then the position beside the payment for a wallet in the address, else the three steps. */
function KaminoSkeleton({ search }: { search: URLSearchParams }) {
  const wallet = search.has('wallet');
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col gap-2">
        <Line className="w-40" />
        <Line line="h-8 sm:h-10" bar="h-5 sm:h-6" className="w-60 sm:w-72" />
        <div className="flex max-w-2xl flex-col">
          <Line line="h-6" className="w-full" />
          <Line line="h-6" className="w-full sm:w-3/4" />
          <Line line="h-6 sm:hidden" className="w-full" />
          <Line line="h-6 sm:hidden" className="w-2/5" />
        </div>
      </div>
      {wallet && search.has('obligation') && (
        <Frame className="flex-row gap-3 p-4">
          <Skeleton className="size-5 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Line className="w-44" />
            <Line className="w-full sm:w-96" />
            <Line line="h-5 sm:hidden" className="w-1/2" />
          </div>
        </Frame>
      )}
      <Frame className="gap-2 p-5">
        <Line className="w-28" />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Skeleton className="h-12 w-full rounded-md sm:flex-1" />
          <Skeleton className="h-12 w-full rounded-md sm:w-36" />
        </div>
      </Frame>
      {wallet ? (
        // the columns of features/kamino/layout.tsx, as the page shows them while it reads the positions
        <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,27.5rem)] md:gap-x-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,var(--container-run))]">
          <div className="flex min-w-0 flex-col gap-4">
            <Line className="w-56" />
            <Frame className="gap-6 p-6">
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-28" />
                <Skeleton className="ml-auto h-6 w-36 rounded-full" />
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex items-end justify-between">
                  <Skeleton className="h-4 w-10" />
                  <Skeleton className="h-8 w-28" />
                </div>
                <Skeleton className="h-2.5 w-full rounded-full" />
                <Skeleton className="h-3 w-3/5" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-24 rounded-lg" />
                <Skeleton className="h-24 rounded-lg" />
              </div>
              <Skeleton className="h-28 rounded-lg" />
            </Frame>
          </div>
          <Frame className="gap-4 p-6 md:self-start">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-md" />
          </Frame>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map(index => (
            <div key={index} className="flex gap-3 rounded-lg border border-border bg-surface/60 p-4 sm:flex-col">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Line className="w-32" />
                <Line className="w-full" />
                <Line line="h-5 sm:max-lg:hidden" className="w-3/4" />
                <Line line="h-5 hidden sm:max-lg:flex" className="w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** /build: the stepper, the step's heading, and the form beside the recipe, or at step 4 the run card. */
function BuildSkeleton({ search }: { search: URLSearchParams }) {
  const step = search.get('step');
  const later = !!step && step !== '1';
  const run = step === '4';
  return (
    <div className="flex flex-col gap-8">
      <div className="border-b border-border pb-5">
        <div className="flex h-9 items-center">
          {[0, 1, 2, 3].map(index => (
            <div key={index} className={cn('flex min-w-0 items-center', index < 3 && 'flex-1')}>
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <Skeleton className="ml-2.5 hidden h-3 w-20 sm:block" />
              {index < 3 && <span className="mx-2 h-px min-w-4 flex-1 bg-border-strong sm:mx-3" />}
            </div>
          ))}
        </div>
        <Line line="mt-3 h-5 sm:hidden" className="w-36" />
      </div>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col">
          <Line line="h-8 sm:h-10" bar="h-5 sm:h-6" className="w-40 sm:w-48" />
          <div className="mt-1.5 flex max-w-2xl flex-col">
            <Line line="h-6" className="w-full sm:w-11/12" />
            {/* the description of the later steps takes a second line on a wide screen too, and a third on a phone */}
            <Line line={later ? 'h-6' : 'h-6 sm:hidden'} className="w-full sm:w-1/2" />
            {later && <Line line="h-6 sm:hidden" className="w-1/3" />}
          </div>
        </div>
        {run ? (
          // the run card under the heading, and what will run folded under it
          <div className="flex w-full max-w-run min-w-0 flex-col gap-4">
            <Frame className="h-[30.75rem] gap-4 p-5 max-sm:h-[31.375rem]">
              <Line className="w-28" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-[8.5rem] w-full rounded-lg" />
                <Skeleton className="h-[8.5rem] w-full rounded-lg" />
              </div>
              <Skeleton className="h-12 w-full rounded-md" />
              <div className="flex flex-col gap-1">
                <Line className="w-3/5" />
                <Line className="w-4/5" />
              </div>
            </Frame>
            <Frame className="h-[3.125rem] justify-center px-4 max-sm:h-[4.125rem]">
              <Line className="w-56 max-w-full" />
            </Frame>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:items-start">
            <div className="flex min-w-0 flex-col gap-8 md:col-span-7">
              <Frame className="gap-2 p-4 sm:p-6">
                <Line className="w-24" />
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Skeleton className="h-12 w-full rounded-md sm:flex-1" />
                  <Skeleton className="h-12 w-full rounded-md sm:w-28" />
                </div>
                <Line className="w-3/5" />
                <Skeleton className="mt-9 h-[9.75rem] w-full rounded-lg" />
              </Frame>
              <div className="flex flex-col gap-3">
                <Line className="w-40" />
                <div className="grid gap-2 sm:grid-cols-2">
                  {[0, 1, 2, 3].map(index => (
                    <Skeleton key={index} className="h-[3.625rem] rounded-lg" />
                  ))}
                </div>
              </div>
            </div>
            <Frame className="gap-6 p-6 md:col-span-5">
              <div className="flex flex-col gap-1">
                <Line line="h-6" bar="h-3.5" className="w-36" />
                <Line className="w-3/5" />
              </div>
              {[0, 1, 2, 3].map(index => (
                <div key={index} className="flex gap-3">
                  <Skeleton className="size-7 shrink-0 rounded-full" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Line className="w-24" />
                    <Line className="w-full" />
                    <Line className="w-2/3" />
                  </div>
                </div>
              ))}
            </Frame>
          </div>
        )}
      </div>
    </div>
  );
}

/** /r/:id: its heading, then what will run, beside the payment from 1200 px. */
function SharedSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-run min-w-0 flex-col gap-5 lg:max-w-none">
      <div className="flex flex-col gap-1.5">
        <Line line="h-10" bar="h-6" className="w-full max-w-96" />
        <Line line="h-10 sm:hidden" bar="h-6" className="w-1/3" />
        <div className="flex flex-col">
          <Line className="w-full max-w-[32rem]" />
          <Line className="w-1/3" />
        </div>
      </div>
      {/* SHARED_COLUMNS of features/run/parts.tsx */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,var(--container-run))] lg:items-start lg:gap-x-8">
        <div className="flex min-w-0 flex-col gap-4">
          <Frame className="h-[21.75rem] gap-3 p-4 max-sm:h-[28.375rem]">
            <Line className="w-4/5" />
            <Line className="w-full" />
            <Line className="w-full" />
            <Line className="w-2/3" />
          </Frame>
          <Frame className="h-[30rem] gap-4 p-4">
            <Line line="h-6" bar="h-3.5" className="w-56" />
            <Skeleton className="h-36 w-full rounded-lg" />
            <Skeleton className="h-36 w-full rounded-lg" />
          </Frame>
        </div>
        <Frame className="h-[36rem] gap-4 p-6">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-md" />
        </Frame>
      </div>
    </div>
  );
}

/** Any other page: a heading over two cards. */
function AnySkeleton() {
  return (
    <div className="mx-auto flex max-w-[52rem] flex-col gap-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton lines={2} className="max-w-xl" />
      <Frame className="gap-4 p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </Frame>
      <Frame className="gap-4 p-5">
        <Skeleton className="h-5 w-32" />
        <Skeleton lines={3} />
      </Frame>
    </div>
  );
}

const SKELETONS: Record<string, (search: URLSearchParams) => ReactNode> = {
  '/kamino': search => <KaminoSkeleton search={search} />,
  '/build': search => <BuildSkeleton search={search} />,
  '/r/:id': () => <SharedSkeleton />,
};

/**
 * The shapes of the page at `path`, a route pattern. A status, so a screen reader hears that the page is on its way: a
 * div with no role may not carry a label (axe: aria-prohibited-attr), and aria-busy would keep the region quiet until
 * it is gone.
 */
export function PageSkeleton({ path }: { path?: string }) {
  const search = new URLSearchParams(useSearch());
  const shapes = path && SKELETONS[path];
  return (
    <div role="status">
      <span className="sr-only">Loading the page…</span>
      {shapes ? shapes(search) : <AnySkeleton />}
    </div>
  );
}

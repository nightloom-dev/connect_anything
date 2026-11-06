import { useMemo, type ReactNode } from 'react';
import { Blocks, FileWarning, LifeBuoy, Link2Off } from 'lucide-react';
import { Link } from 'wouter';
import { useExecution } from '@aurora-is-near/intents-connect/react';
import { parseStored, toSolanaRecipe } from '../../recipe.ts';
import { Failure, FetchError, useJson } from '../../ui.tsx';
import { EmptyState, Skeleton, Spinner, buttonClass } from '../../ui/index.ts';
import { Execute } from './execute.tsx';
import { SHARED_COLUMNS, SHARED_LEFT } from './parts.tsx';

/** A link that leads nowhere that can run: what is wrong, what to do about it, and the two ways on, as on the 404 page. */
export function Dead({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl border border-border bg-surface">
      <EmptyState
        level={2}
        icon={icon}
        title={title}
        action={
          <>
            <Link href="/kamino" className={buttonClass({ size: 'sm' })}>
              <LifeBuoy className="size-4" aria-hidden />
              Rescue Kamino
            </Link>
            <Link href="/build" className={buttonClass({ size: 'sm' })}>
              <Blocks className="size-4" aria-hidden />
              Build a recipe
            </Link>
          </>
        }
      >
        {children}
        <p className="mt-1.5">Ask the sender for a new link.</p>
      </EmptyState>
    </div>
  );
}

/** The recipe on its way: the trust panel, what will run and the card, as grey shapes where they will stand. */
export function Loading() {
  return (
    <div aria-busy className="flex flex-col gap-4">
      <p role="status" className="flex items-center gap-2 text-sm text-muted">
        <Spinner size="sm" />
        Loading the recipe…
      </p>
      <div className={SHARED_COLUMNS}>
        <div className={SHARED_LEFT}>
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
        <Skeleton className="h-80 rounded-xl lg:col-start-2 lg:row-start-1" />
      </div>
    </div>
  );
}

/** The heading of /r/:id: the page's h1, and a lower level where the gallery shows it inside a section. */
export function SharedHeader({ level = 1 }: { level?: 1 | 3 }) {
  const Heading = `h${level}` as const;
  return (
    <header className="flex flex-col gap-1.5">
      <Heading className="text-2xl leading-tight font-semibold tracking-tight text-text">A recipe someone shared with you</Heading>
      <p className="text-sm text-muted">Read what it runs on Solana, then pay for it from an EVM wallet with one signature.</p>
    </header>
  );
}

/** /r/:id: a recipe someone shared, loaded by its id, with the payment panel in its shared mode. */
export function SharedRecipe({ id }: { id: string }) {
  const exec = useExecution();
  const found = useJson<unknown>(`/api/recipes/${encodeURIComponent(id)}`);
  const parsed = useMemo(() => {
    if (found.data === undefined) return undefined;
    try {
      const stored = parseStored(found.data);
      return { stored, recipe: toSolanaRecipe(stored) };
    } catch (error) {
      return { problem: (error as Error).message };
    }
  }, [found.data]);
  const missing = found.error instanceof FetchError && (found.error.status === 404 || found.error.status === 400);

  return (
    <section className="mx-auto flex w-full max-w-run min-w-0 flex-col gap-5 lg:max-w-none">
      <SharedHeader />
      {found.loading && <Loading />}
      {missing && <Dead icon={<Link2Off />} title="This link does not lead to a recipe." />}
      {found.error && !missing && <Failure error={found.error} retry={found.retry} />}
      {parsed?.problem && (
        <Dead icon={<FileWarning />} title="This recipe cannot be read.">
          <p>{parsed.problem} Nothing can run from this link.</p>
        </Dead>
      )}
      {parsed?.stored && <Execute exec={exec} recipe={parsed.recipe} stored={parsed.stored} shared />}
    </section>
  );
}

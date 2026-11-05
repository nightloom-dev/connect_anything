import { useMemo } from 'react';
import { useExecution } from '@aurora-is-near/intents-connect/react';
import { parseStored, toSolanaRecipe } from '../../recipe.ts';
import { Failure, FetchError, Notice, useJson } from '../../ui.tsx';
import { Execute } from './execute.tsx';

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
    <section>
      <h2>A recipe someone shared with you</h2>
      {found.loading && <Notice>Loading the recipe…</Notice>}
      {missing && <Notice kind="error">This link does not lead to a recipe. Check it with whoever sent it to you.</Notice>}
      {found.error && !missing && <Failure error={found.error} retry={found.retry} />}
      {parsed?.problem && <Notice kind="error">{parsed.problem} Nothing can run from this link.</Notice>}
      {parsed?.stored && <Execute exec={exec} recipe={parsed.recipe} stored={parsed.stored} shared />}
    </section>
  );
}

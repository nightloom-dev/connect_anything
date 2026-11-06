import { useState } from 'react';
import { Blocks } from 'lucide-react';
import { useLocation } from 'wouter';
import type { StoredRecipe } from '../../recipe.ts';
import { Button, Dialog, toast } from '../../ui/index.ts';
import { IMPORT, readSession } from '../builder/storage.ts';

type ReplaceRecipeProps = {
  open: boolean;
  /** The steps of the recipe the builder holds. */
  steps: number;
  onCancel: () => void;
  onReplace: () => void;
};

/** Asks before the rescue's recipe takes the place of one the builder holds, which would be lost. */
export function ReplaceRecipe({ open, steps, onCancel, onReplace }: ReplaceRecipeProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      icon={<Blocks />}
      title="Replace the recipe in the builder?"
      description={`The builder holds a recipe of ${steps === 1 ? '1 step' : `${steps} steps`}. Opening this one there replaces it.`}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={onReplace}>
            Replace it
          </Button>
        </>
      }
    />
  );
}

/**
 * Opens the rescue's recipe in the builder at its second step, where every instruction and account of it shows. The
 * builder takes it from session storage once and parses it with parseStored. `disabled` while a run is in flight: the
 * builder would take the page and its progress away.
 */
export function OpenInBuilder({ stored, disabled = false }: { stored: StoredRecipe; disabled?: boolean }) {
  const [, navigate] = useLocation();
  // the dialog keeps its count while it closes
  const [asking, setAsking] = useState({ open: false, steps: 0 });
  const open = () => {
    try {
      sessionStorage.setItem(IMPORT, JSON.stringify(stored));
    } catch {
      toast.error('This browser keeps no session storage, so the builder cannot take the recipe.');
      return;
    }
    navigate('/build?step=2');
  };
  const ask = () => {
    const held = readSession()?.steps;
    // a recipe of its own in the builder, which this one would replace; the same recipe again loses nothing
    if (held?.length && JSON.stringify(held) !== JSON.stringify(stored.steps)) setAsking({ open: true, steps: held.length });
    else open();
  };
  return (
    <>
      <Button size="sm" icon={<Blocks />} disabled={disabled} onClick={ask}>
        Open in builder
      </Button>
      <ReplaceRecipe open={asking.open} steps={asking.steps} onCancel={() => setAsking(state => ({ ...state, open: false }))} onReplace={open} />
    </>
  );
}

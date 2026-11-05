import { Blocks } from 'lucide-react';
import { useLocation } from 'wouter';
import type { StoredRecipe } from '../../recipe.ts';
import { Button, toast } from '../../ui/index.ts';

/** The builder takes a recipe from here once, parses it with parseStored and removes it. */
export const BUILDER_IMPORT = 'connect-anything:builder-import';

/** Opens the rescue's recipe in the builder at its second step, where every instruction and account of it shows. */
export function OpenInBuilder({ stored }: { stored: StoredRecipe }) {
  const [, navigate] = useLocation();
  const open = () => {
    try {
      sessionStorage.setItem(BUILDER_IMPORT, JSON.stringify(stored));
    } catch {
      toast.error('This browser keeps no session storage, so the builder cannot take the recipe.');
      return;
    }
    navigate('/build?step=2');
  };
  return (
    <Button size="sm" icon={<Blocks />} onClick={open}>
      Open in builder
    </Button>
  );
}

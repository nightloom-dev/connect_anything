import { usePageTitle } from '../../app/title.ts';
import { SharedRecipe } from './shared.tsx';

/** /r/:id. */
export default function SharedPage({ id }: { id: string }) {
  usePageTitle('Shared recipe');
  return <SharedRecipe id={id} />;
}

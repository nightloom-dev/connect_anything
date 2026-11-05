import { usePageTitle } from '../../app/title.ts';
import { SharedRecipe } from './shared.tsx';

/** /r/:id. Until its redesign it is the old screen, in the .legacy wrapper its styles are scoped to. */
export default function SharedPage({ id }: { id: string }) {
  usePageTitle('Shared recipe');
  return (
    <div className="legacy">
      <SharedRecipe id={id} />
    </div>
  );
}

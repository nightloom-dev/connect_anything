import { usePageTitle } from '../../app/title.ts';
import { Rescue } from './rescue.tsx';

/** /kamino. Until its redesign it is the old screen, in the .legacy wrapper its styles are scoped to. */
export default function KaminoPage() {
  usePageTitle('Rescue Kamino');
  return (
    <div className="legacy">
      <Rescue />
    </div>
  );
}

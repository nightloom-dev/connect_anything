import { usePageTitle } from '../../app/title.ts';
import { Builder } from './builder.tsx';

/** /build. Until its redesign it is the old screen, in the .legacy wrapper its styles are scoped to. */
export default function BuilderPage() {
  usePageTitle('Build');
  return (
    <div className="legacy">
      <Builder />
    </div>
  );
}

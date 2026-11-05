import { usePageTitle } from '../../app/title.ts';
import { Builder } from './builder.tsx';

/** /build: program, instruction, simulation and run. */
export default function BuilderPage() {
  usePageTitle('Build');
  return <Builder />;
}

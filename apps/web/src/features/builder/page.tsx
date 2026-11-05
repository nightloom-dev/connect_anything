import { usePageTitle } from '../../app/title.ts';
import { Builder } from './builder.tsx';

/** /build: program, instruction, simulation and run. The run card inside step 4 keeps its own .legacy wrapper for now. */
export default function BuilderPage() {
  usePageTitle('Build');
  return <Builder />;
}

import type { DevSection } from './types.ts';

export type { DevSection } from './types.ts';

type Module = { sections?: DevSection[]; order?: number };

// Every file here that exports `sections` joins the gallery, so a stream adds its own file and edits nothing shared.
// `order` (default 100) sorts the files, then their names do.
const modules = import.meta.glob<Module>('./*.tsx', { eager: true });

export const sections: DevSection[] = Object.entries(modules)
  .sort(([a, one], [b, other]) => (one.order ?? 100) - (other.order ?? 100) || a.localeCompare(b))
  .flatMap(([, module]) => module.sections ?? []);

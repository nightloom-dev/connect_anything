import { useEffect } from 'react';
import { usePageTitle } from '../app/title.ts';
import { Badge } from '../ui/index.ts';
import { sections } from './dev/index.ts';

/** Every component and screen state on fake data, for building and reviewing the UI. Development builds only. */
export default function DevStates() {
  usePageTitle('States');
  const only = new URLSearchParams(location.search).get('only');
  const shown = only ? sections.filter(section => section.id.startsWith(only)) : sections;

  // the sections render after the lazy chunk, too late for the browser's own jump to the anchor
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  return (
    <div className="grid gap-10 lg:grid-cols-[12rem_minmax(0,1fr)]">
      <nav aria-label="Sections" className="hidden lg:block">
        <ul className="sticky top-20 flex flex-col gap-0.5 text-sm">
          {shown.map(section => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="block truncate rounded-md px-2.5 py-1.5 text-muted hover:bg-white/5 hover:text-text">
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-col gap-16">
        <header className="flex flex-col gap-2">
          <Badge variant="warn" className="self-start">
            Development only
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-text">States</h2>
          <p className="max-w-2xl text-muted">
            Every component in every state, on fake data. Link a section with its anchor, or show only some with <code className="font-mono text-[13px] text-text">?only=ui-</code>.
          </p>
        </header>
        {shown.map(section => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="flex scroll-mt-20 flex-col gap-6">
            <div className="flex flex-col gap-1 border-b border-border pb-3">
              <h3 id={`${section.id}-title`} className="group flex items-center gap-2 text-lg font-semibold text-text">
                {section.title}
                <a href={`#${section.id}`} className="text-faint opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Link to ${section.title}`}>
                  #
                </a>
              </h3>
              {section.description && <p className="text-sm text-muted">{section.description}</p>}
            </div>
            {section.render()}
          </section>
        ))}
        {shown.length === 0 && <p className="text-muted">No section starts with “{only}”.</p>}
      </div>
    </div>
  );
}

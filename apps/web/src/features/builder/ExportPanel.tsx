import { useEffect, useRef } from 'react';
import { FileCode2, Link2 } from 'lucide-react';
import { Alert, Button, CodeBlock, CopyButton, Tabs } from '../../ui/index.ts';

type ExportTabsProps = {
  /** The link once created for this very recipe. */
  url?: string;
  working: boolean;
  error?: string;
  onCreate: () => void;
  code: { text?: string; problem?: string };
  /** Which tab is open first, for the gallery. */
  defaultIndex?: number;
};

/** The recipe out of this page: a link that opens it on another browser, or a TypeScript module for the SDK. */
export function ExportTabs({ url, working, error, onCreate, code, defaultIndex = 0 }: ExportTabsProps) {
  // The button goes once the link is made: the focus, which it kept while it worked, goes on to the link, unless the
  // person has moved it elsewhere meanwhile.
  const asked = useRef(false);
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!url || !asked.current) return;
    asked.current = false;
    if (!document.activeElement || document.activeElement === document.body) link.current?.focus();
  }, [url]);
  return (
    <Tabs
      label="Export as"
      defaultIndex={defaultIndex}
      tabs={[
        {
          id: 'link',
          label: 'Link',
          icon: <Link2 />,
          content: (
            <div className="flex flex-col gap-3">
              <p className="text-sm leading-relaxed text-muted">Opens this recipe on another browser. Whoever opens it runs it with their own wallet and sees that you made it.</p>
              {url ? (
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border-strong bg-surface-2 py-1.5 pr-1.5 pl-3">
                  <Link2 className="size-4 shrink-0 text-muted" aria-hidden />
                  <a ref={link} href={url} className="min-w-0 flex-1 truncate font-mono text-[13px] text-accent-hover underline-offset-2 hover:underline">
                    {url}
                  </a>
                  <CopyButton value={url} label="Copy link" message="Link copied" size="sm" />
                </div>
              ) : (
                <Button
                  icon={<Link2 />}
                  loading={working}
                  onClick={() => {
                    asked.current = true;
                    onCreate();
                  }}
                  className="self-start"
                >
                  {working ? 'Creating the link…' : 'Create a link'}
                </Button>
              )}
              {error && <Alert kind="danger">{error}</Alert>}
            </div>
          ),
        },
        {
          id: 'typescript',
          label: 'TypeScript',
          icon: <FileCode2 />,
          content: (
            <div className="flex flex-col gap-3">
              {code.problem && <Alert kind="danger">The recipe cannot be exported as code: {code.problem}</Alert>}
              {code.text && (
                <>
                  <p className="text-sm leading-relaxed text-muted">A module exporting a SolanaRecipe for the Aurora SDK.</p>
                  <CodeBlock code={code.text} language="ts" title="recipe.ts" download="recipe.ts" maxHeight={380} />
                </>
              )}
            </div>
          ),
        },
      ]}
    />
  );
}

import { useMemo, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { generate, parse } from 'sugar-high/core';
import * as json from 'sugar-high/lang/json';
import { tokenize as typescript } from 'sugar-high/lang/typescript';
import { cn } from './cn.ts';
import { CopyButton } from './CopyButton.tsx';
import { IconButton } from './IconButton.tsx';

export type CodeLanguage = 'ts' | 'json' | 'text';

type CodeBlockProps = {
  code: string;
  language?: CodeLanguage;
  /** In the bar above the code: a file name. Default: the language. */
  title?: ReactNode;
  /** A file name turns on Download. */
  download?: string;
  copy?: boolean;
  /** Taller code scrolls inside. */
  maxHeight?: number | string;
  lineNumbers?: boolean;
  /** Wrap long lines instead of scrolling sideways. */
  wrap?: boolean;
  className?: string;
};

const NAME: Record<CodeLanguage, string> = { ts: 'TypeScript', json: 'JSON', text: 'Text' };
const MIME: Record<CodeLanguage, string> = { ts: 'text/typescript', json: 'application/json', text: 'text/plain' };

// only the two grammars the app shows, so the other languages of sugar-high stay out of the bundle
function highlight(code: string, language: CodeLanguage) {
  if (language === 'text') return null;
  const options = language === 'json' ? { ...json, jsx: false, regex: false, templateStrings: false } : { tokenize: typescript };
  return generate(parse(code, options));
}

export function saveFile(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  // the download has started by then; revoking at once cancels it in some browsers
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Highlighted code with Copy and Download. It renders tokens as React elements, never as HTML. */
export function CodeBlock({ code, language = 'ts', title, download, copy = true, maxHeight = 420, lineNumbers = true, wrap = false, className }: CodeBlockProps) {
  const lines = useMemo(() => highlight(code, language), [code, language]);
  const label = typeof title === 'string' ? title : NAME[language];
  return (
    <div data-ui="code-block" className={cn('min-w-0 overflow-hidden rounded-lg border border-border bg-[#0d1016]', className)}>
      <div className="flex h-10 items-center justify-between gap-2 border-b border-border bg-surface/70 pr-1.5 pl-3.5">
        <span className="truncate font-mono text-xs text-muted">{title ?? NAME[language]}</span>
        <div className="flex shrink-0 items-center gap-0.5">
          {copy && <CopyButton value={code} label="Copy code" message="Code copied" />}
          {download && <IconButton label={`Download ${download}`} icon={<Download />} size="xs" onClick={() => saveFile(download, code, MIME[language])} />}
        </div>
      </div>
      <pre
        role="region"
        aria-label={label}
        tabIndex={0}
        className="code-hl overflow-auto py-3 pr-4 pl-3 font-mono text-[12.5px] leading-[1.7] text-text focus-visible:outline-offset-[-2px]"
        style={{ maxHeight }}
      >
        <code className={cn('block', lineNumbers && 'code-lines', wrap ? 'whitespace-pre-wrap break-all' : 'w-max min-w-full whitespace-pre')}>
          {lines
            ? lines.map((line, index) => (
                <span key={index} className="code-line">
                  {line.children.map((token, at) => (
                    <span key={at} className={token.properties.className} style={token.properties.style}>
                      {token.children.map(text => text.value).join('')}
                    </span>
                  ))}
                </span>
              ))
            : code.split('\n').map((line, index) => (
                <span key={index} className="code-line">
                  {line}
                </span>
              ))}
        </code>
      </pre>
    </div>
  );
}

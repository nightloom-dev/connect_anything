import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'wouter';
import { DOCS_URL, LogoMark, REPO_URL } from './brand.tsx';

// The footer is the title block of a drawing: ruled cells, a small key in capitals, the value under it.

const item = 'rounded-xs text-text underline-offset-4 transition-colors duration-120 hover:text-accent hover:underline';
const external = `${item} inline-flex items-center gap-0.5`;

function Cell({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 bg-surface px-3.5 py-2.5 ${className ?? ''}`}>
      <span className="label-caps text-muted">{title}</span>
      {children}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-content px-4 py-8 sm:px-6">
        <div className="grid grid-cols-2 gap-px border-[1.5px] border-text bg-text text-sm md:grid-cols-[1.2fr_1.5fr_1.3fr_2fr]">
          <Cell title="Project">
            <span className="flex items-center gap-2 font-medium text-text">
              <LogoMark size={16} className="shrink-0" />
              Connect Anything
            </span>
          </Cell>
          <Cell title="Made for">
            <span className="text-text">Encode Solana Hackathon 2026</span>
          </Cell>
          <Cell title="Built on" className="max-md:col-span-2">
            <span className="text-text">Aurora Intents Connect</span>
          </Cell>
          <Cell title="Links" className="max-md:col-span-2">
            <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1">
              <Link href="/kamino" className={item}>
                Rescue Kamino
              </Link>
              <Link href="/build" className={item}>
                Build
              </Link>
              <a href={DOCS_URL} target="_blank" rel="noreferrer" className={external}>
                Docs
                <ArrowUpRight className="size-3.5" aria-hidden />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className={external}>
                GitHub
                <ArrowUpRight className="size-3.5" aria-hidden />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </nav>
          </Cell>
        </div>
      </div>
    </footer>
  );
}

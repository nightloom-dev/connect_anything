import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'wouter';
import { DOCS_URL, ISSUES_URL, LogoMark, REPO_URL, SELF_HOST_URL, WATCHER_URL } from './brand.tsx';

// The footer of the product: what it is and where it runs, the ways in, and where its code and docs are. Its column
// titles are not headings, so that each page's outline stays its own.

const link = 'rounded-xs text-text underline-offset-4 transition-colors duration-120 hover:text-accent hover:underline';
const CHAINS = [
  ['Base', '/icons/base.svg'],
  ['Arbitrum', '/icons/arbitrum.svg'],
  ['Ethereum', '/icons/ethereum.svg'],
] as const;

function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`${link} inline-flex items-center gap-0.5`}>
      {children}
      <ArrowUpRight className="size-3.5 text-muted" aria-hidden />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function Column({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <nav aria-labelledby={id} className="flex flex-col gap-3">
      <p id={id} className="label-caps text-muted">
        {title}
      </p>
      <ul className="flex flex-col gap-2 text-sm">{children}</ul>
    </nav>
  );
}

const Icon = ({ src }: { src: string }) => <img src={src} alt="" width={18} height={18} className="size-[18px] rounded-full ring-2 ring-bg" />;

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-content px-4 pt-10 pb-6 sm:px-6 md:pt-12">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="col-span-2 flex max-w-sm flex-col gap-4 md:col-span-1">
            <Link href="/" className="flex w-fit items-center gap-2.5 rounded-md text-[15px] font-semibold tracking-tight text-text outline-offset-4">
              <LogoMark size={22} />
              Connect Anything
            </Link>
            <p className="text-sm text-muted">Turn an Anchor program into a button anyone can press from an EVM chain: one signature, no Solana wallet, no SOL.</p>
            {/* where the money comes from and where the program runs */}
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
              <span className="flex -space-x-1" aria-hidden>
                {CHAINS.map(([name, src]) => (
                  <Icon key={name} src={src} />
                ))}
              </span>
              <span>{CHAINS.map(([name]) => name).join(', ')}</span>
              <span aria-hidden className="h-px w-4 bg-border-strong" />
              <Icon src="/icons/solana.svg" />
              <span>Solana</span>
            </p>
          </div>
          <Column id="footer-product" title="Product">
            <li>
              <Link href="/kamino" className={link}>
                Rescue Kamino
              </Link>
            </li>
            <li>
              <Link href="/build" className={link}>
                Recipe builder
              </Link>
            </li>
            <li>
              <External href={WATCHER_URL}>Telegram watcher</External>
            </li>
          </Column>
          <Column id="footer-developers" title="Developers">
            <li>
              <External href={DOCS_URL}>Docs</External>
            </li>
            <li>
              <External href={SELF_HOST_URL}>Run it yourself</External>
            </li>
            <li>
              <External href={ISSUES_URL}>Report an issue</External>
            </li>
            <li>
              <External href={REPO_URL}>GitHub</External>
            </li>
          </Column>
        </div>
        <div className="mt-10 flex flex-col gap-1.5 border-t border-text pt-4 font-mono text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Connect Anything</p>
          <p>Built on Aurora Intents Connect</p>
        </div>
      </div>
    </footer>
  );
}

import { Link } from 'wouter';
import { DOCS_URL, LogoMark, REPO_URL } from './brand.tsx';

const item = 'rounded-xs text-muted transition-colors duration-120 hover:text-text';

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-content flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="flex items-center gap-2.5 text-muted">
          <LogoMark size={18} className="shrink-0" />
          <span>Built on Aurora Intents Connect · Encode Solana Hackathon 2026</span>
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/kamino" className={item}>
            Rescue Kamino
          </Link>
          <Link href="/build" className={item}>
            Build
          </Link>
          <a href={DOCS_URL} target="_blank" rel="noreferrer" className={item}>
            README<span className="sr-only"> (opens in a new tab)</span>
          </a>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className={item}>
            GitHub<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </nav>
      </div>
    </footer>
  );
}

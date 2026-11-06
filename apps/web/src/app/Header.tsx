import type { ReactNode } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { buttonLook } from '../ui/Button.tsx';
import { cn } from '../ui/cn.ts';
import { Popover } from '../ui/Popover.tsx';
import { Tooltip } from '../ui/Tooltip.tsx';
import { DOCS_URL, GitHubMark, LogoMark, REPO_URL } from './brand.tsx';

const NAV = [
  { href: '/kamino', label: 'Rescue Kamino' },
  { href: '/build', label: 'Build' },
];

const isActive = (location: string, href: string) => location === href;

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const [location] = useLocation();
  const active = isActive(location, href);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors duration-120',
        active ? 'text-text after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:bg-accent' : 'text-muted hover:bg-text/5 hover:text-text',
      )}
    >
      {children}
    </Link>
  );
}

const external = 'flex h-8 items-center gap-1 rounded-md px-3 text-sm font-medium text-muted transition-colors duration-120 hover:bg-text/5 hover:text-text';

function MobileMenu() {
  const [location] = useLocation();
  return (
    <Popover
      label="Menu"
      className="md:hidden"
      panelClassName="w-60"
      trigger={
        <button type="button" aria-label="Menu" data-ui="icon-button" className={cn(buttonLook('ghost'), 'group size-8')}>
          <Menu className="size-[18px] group-data-open:hidden" aria-hidden />
          <X className="hidden size-[18px] group-data-open:block" aria-hidden />
        </button>
      }
    >
      {({ close }) => (
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {NAV.map(({ href, label }) => {
            const active = isActive(location, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={close}
                aria-current={active ? 'page' : undefined}
                className={cn('flex h-10 items-center rounded-lg px-3 text-[15px] font-medium', active ? 'bg-accent/8 text-text' : 'text-muted hover:bg-text/5 hover:text-text')}
              >
                {label}
              </Link>
            );
          })}
          <div className="my-1 border-t border-border" />
          <a href={DOCS_URL} target="_blank" rel="noreferrer" className="flex h-10 items-center justify-between rounded-lg px-3 text-[15px] font-medium text-muted hover:bg-text/5 hover:text-text">
            Docs
            <ArrowUpRight className="size-4" aria-hidden />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex h-10 items-center justify-between rounded-lg px-3 text-[15px] font-medium text-muted hover:bg-text/5 hover:text-text">
            GitHub
            <ArrowUpRight className="size-4" aria-hidden />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </nav>
      )}
    </Popover>
  );
}

type HeaderProps = {
  /** What stands in the wallet's place until the real button arrives in the slot. */
  wallet?: ReactNode;
  walletSlot?: (element: HTMLElement | null) => void;
};

export function Header({ wallet, walletSlot }: HeaderProps) {
  return (
    <header className="group/header sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-content items-center gap-2 px-4 sm:px-6">
        {/* not a heading: each page's own title is its h1 */}
        <div className="mr-2 shrink-0 text-[15px] leading-none font-semibold tracking-tight sm:mr-4">
          <Link href="/" className="flex items-center gap-2.5 rounded-md text-text outline-offset-4">
            <LogoMark size={26} />
            {/* on a narrow phone a connected wallet needs the room, and the name stays for screen readers */}
            <span className="max-[27.5rem]:group-has-data-[wallet=connected]/header:sr-only">Connect Anything</span>
          </Link>
        </div>
        <nav aria-label="Main" className="hidden items-center gap-0.5 md:flex">
          {NAV.map(({ href, label }) => (
            <NavLink key={href} href={href}>
              {label}
            </NavLink>
          ))}
          <a href={DOCS_URL} target="_blank" rel="noreferrer" className={external}>
            Docs
            <ArrowUpRight className="size-3.5" aria-hidden />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="hidden md:block">
            <Tooltip content="GitHub" side="bottom" describe={false}>
              <a href={REPO_URL} target="_blank" rel="noreferrer" aria-label="GitHub repository (opens in a new tab)" className={cn(buttonLook('ghost'), 'size-8')}>
                <GitHubMark className="size-[18px]" />
              </a>
            </Tooltip>
          </div>
          {wallet}
          <span ref={walletSlot} className="contents" />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}

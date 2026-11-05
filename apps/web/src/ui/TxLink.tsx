import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { CHAINS } from '../connect.ts';
import { chainMeta, truncateMiddle } from './chains.ts';
import { cn } from './cn.ts';

type TxLinkProps = {
  hash: string;
  /** base, arb, eth, or sol / solana. An EVM chain the app does not know falls back to the first in CHAINS, as execute.tsx does. */
  chain: string;
  /** Instead of the shortened hash. */
  label?: ReactNode;
  chars?: number;
  className?: string;
};

/** A transaction in its chain's explorer, in a new tab. */
export function TxLink({ hash, chain, label, chars = 4, className }: TxLinkProps) {
  const meta = chainMeta(chain) ?? chainMeta(CHAINS[0].id)!;
  return (
    <a
      data-ui="tx-link"
      href={`${meta.tx}${hash}`}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'inline-flex items-center gap-1 rounded-xs font-mono text-[0.8125rem] tracking-tight text-accent underline decoration-accent/40 underline-offset-[3px] transition-colors hover:text-accent-hover hover:decoration-current',
        className,
      )}
    >
      {label ?? truncateMiddle(hash, chars)}
      <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only"> on {meta.explorer}, opens in a new tab</span>
    </a>
  );
}

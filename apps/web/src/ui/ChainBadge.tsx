import { chainMeta } from './chains.ts';
import { cn } from './cn.ts';
import { ChainIcon } from './TokenIcon.tsx';

type ChainBadgeProps = {
  /** base, arb, eth, sol (or solana), or any other id, which shows as a letter. */
  chain: string;
  /** In place of the known name, or the name of a chain the app does not know. */
  name?: string;
  size?: 'sm' | 'md';
  /** The icon alone; the name then goes to a screen reader only. */
  iconOnly?: boolean;
  className?: string;
};

export function ChainBadge({ chain, name, size = 'sm', iconOnly = false, className }: ChainBadgeProps) {
  const label = name ?? chainMeta(chain)?.name ?? chain;
  return (
    <span
      data-ui="chain-badge"
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 font-medium text-text',
        !iconOnly && 'rounded-full border border-border-strong bg-surface-2 pr-2.5',
        !iconOnly && (size === 'sm' ? 'h-6 pl-1 text-xs' : 'h-7 pl-1 text-sm'),
        className,
      )}
    >
      <ChainIcon chain={chain} size={size === 'sm' ? 16 : 20} />
      <span className={iconOnly ? 'sr-only' : undefined}>{label}</span>
    </span>
  );
}

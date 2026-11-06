import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Badge } from './Badge.tsx';
import { chainMeta, truncateMiddle } from './chains.ts';
import { cn } from './cn.ts';
import { CopyButton } from './CopyButton.tsx';
import { Tooltip } from './Tooltip.tsx';

type AddressProps = {
  value: string;
  /** Which explorer it opens in: sol (default), base, arb or eth. */
  chain?: string;
  /** A token's mint opens as a token page on Solscan, anything else as an account. */
  kind?: 'account' | 'token';
  /** Who it is, as "your intermediary". */
  label?: ReactNode;
  /** Characters kept on each side of the ellipsis. */
  chars?: number;
  /** The whole value, wrapped, instead of `abcd…wxyz`. */
  full?: boolean;
  copy?: boolean;
  /** The explorer link, on by default for a chain the app knows. */
  explorer?: boolean;
  className?: string;
};

/**
 * A base58 or 0x value as `abcd…wxyz`, the whole of it in a tooltip, with Copy and a link to the explorer. The keyboard
 * finds the whole value on Copy, so the short text takes the focus only where there is no Copy.
 */
export function Address({ value, chain = 'sol', kind = 'account', label, chars = 4, full = false, copy = true, explorer = true, className }: AddressProps) {
  const meta = chainMeta(chain);
  const href = explorer && meta ? `${kind === 'token' ? meta.token : meta.address}${value}` : undefined;
  const whole = <span className="font-mono font-normal break-all">{value}</span>;
  const text = (
    <span
      tabIndex={full || copy ? undefined : 0}
      className={cn('rounded-xs font-mono text-[0.8125rem] leading-5 tracking-tight text-text outline-offset-1', full ? 'break-all' : 'whitespace-nowrap')}
    >
      {full ? value : truncateMiddle(value, chars)}
    </span>
  );
  return (
    <span data-ui="address" className={cn('inline-flex max-w-full min-w-0 items-center gap-1 align-middle', className)}>
      {full ? (
        text
      ) : (
        <Tooltip content={whole} wide>
          {text}
        </Tooltip>
      )}
      {label && (
        <Badge variant="accent" className="ml-1">
          {label}
        </Badge>
      )}
      {copy && <CopyButton value={value} label="Copy address" message="Address copied" tip={full ? undefined : whole} />}
      {href && (
        <Tooltip content={`Open in ${meta!.explorer}`} describe={false}>
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open in ${meta!.explorer} (new tab)`}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/6 hover:text-text"
          >
            <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        </Tooltip>
      )}
    </span>
  );
}

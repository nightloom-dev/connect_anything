import { useState } from 'react';
import { chainMeta } from './chains.ts';
import { cn } from './cn.ts';

const TOKENS: Record<string, string> = {
  USDC: '/icons/usdc.svg',
  USDT: '/icons/usdt.svg',
  SOL: '/icons/sol.svg',
  WSOL: '/icons/sol.svg',
  ETH: '/icons/ethereum.svg',
  WETH: '/icons/ethereum.svg',
};

// for the letter of a token without an icon: picked by the symbol, so a token keeps its color
const FALLBACK = ['#6e7bff', '#3dd6d0', '#f5b544', '#ff7eb6', '#5aa9ff', '#a78bfa', '#3bd67f', '#ff8a5c'];

const tint = (symbol: string) => FALLBACK[[...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0) % FALLBACK.length];

type TokenIconProps = { symbol: string; size?: number; className?: string };

/** Decoration next to the symbol, which says the same, so it has no alt text. */
export function TokenIcon({ symbol, size = 20, className }: TokenIconProps) {
  const key = symbol.toUpperCase().replace(/\.E$/, '');
  const [broken, setBroken] = useState(false);
  const src = TOKENS[key];
  if (src && !broken) {
    return <img data-ui="token-icon" src={src} alt="" width={size} height={size} className={cn('shrink-0 rounded-full', className)} onError={() => setBroken(true)} />;
  }
  return (
    <span
      data-ui="token-icon"
      aria-hidden
      className={cn('inline-grid shrink-0 place-items-center rounded-full font-semibold text-bg', className)}
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.48)), background: tint(key) }}
    >
      {key.slice(0, 1) || '?'}
    </span>
  );
}

type ChainIconProps = { chain: string; size?: number; className?: string };

/** The mark of base, arb, eth or sol, a letter for any other chain. */
export function ChainIcon({ chain, size = 16, className }: ChainIconProps) {
  const meta = chainMeta(chain);
  if (!meta) return <TokenIcon symbol={chain} size={size} className={className} />;
  return <img data-ui="chain-icon" src={meta.icon} alt="" width={size} height={size} className={cn('shrink-0 rounded-full', className)} />;
}

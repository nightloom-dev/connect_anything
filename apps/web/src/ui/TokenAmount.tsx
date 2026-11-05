import type { ReactNode } from 'react';
import { cn } from './cn.ts';
import { TokenIcon } from './TokenIcon.tsx';

const SIZE = {
  sm: { text: 'text-sm', icon: 14 },
  md: { text: 'text-md', icon: 16 },
  lg: { text: 'text-lg', icon: 20 },
  xl: { text: 'text-2xl tracking-tight', icon: 26 },
};

type TokenAmountProps = {
  /** Already formatted, as fromAtomic gives it: this shows figures and works none out. */
  amount: ReactNode;
  symbol: string;
  icon?: boolean;
  size?: keyof typeof SIZE;
  /** Before the figure: "at least", "≈". */
  prefix?: ReactNode;
  className?: string;
};

export function TokenAmount({ amount, symbol, icon = false, size = 'md', prefix, className }: TokenAmountProps) {
  const { text, icon: px } = SIZE[size];
  return (
    <span data-ui="token-amount" className={cn('inline-flex items-center gap-1.5 whitespace-nowrap nums', text, className)}>
      {icon && <TokenIcon symbol={symbol} size={px} />}
      {prefix && <span className="font-normal text-muted">{prefix}</span>}
      <span className="font-semibold text-text">{amount}</span>
      <span className="font-medium text-muted">{symbol}</span>
    </span>
  );
}

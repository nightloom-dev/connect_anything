import type { ReactNode } from 'react';
import { LogoMark } from '../../app/brand.tsx';
import { Badge } from '../../ui/Badge.tsx';
import { cn } from '../../ui/cn.ts';

// A chat with the Telegram watcher of apps/watch. The words are the bot's own (HELP, the /watch reply and alertText in
// apps/watch); the wallet, the position and the figures are an example, and the chat says so. The bot has no fixed
// username: whoever runs the watcher makes their own with @BotFather.

const WALLET = '7xKX…gAsU';
const POSITION = 'Hx3m…9cQe';
const LIQUIDATED_AT = 80;
// the default line: 10 points under the liquidation LTV
const LINE = LIQUIDATED_AT - 10;

// one decimal, as the bot's percent() writes it
const tenths = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (value: number) => `${tenths.format(value)}%`;
// two decimals and no grouping, as the bot's toFixed(2) writes them
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', useGrouping: false });

function Bubble({ from, children, className }: { from: 'me' | 'bot'; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex', from === 'me' ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-[1.45] break-words',
          from === 'me' ? 'rounded-br-md bg-accent-solid text-white' : 'rounded-bl-md border border-border bg-surface-2 text-text',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function WatcherChat({ className }: { className?: string }) {
  return (
    <figure className={cn('overflow-hidden rounded-xl border border-border-strong/70 bg-surface shadow-card', className)}>
      <div className="flex items-center gap-3 border-b border-border bg-surface-2/60 px-4 py-3">
        <LogoMark size={32} className="shrink-0" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-text">Kamino watcher</p>
          <p className="text-xs text-muted">bot</p>
        </div>
        <Badge variant="neutral">Example</Badge>
      </div>
      <div className="flex flex-col gap-2.5 p-4">
        <Bubble from="me">
          <span className="font-mono text-[12.5px]">/watch {WALLET}</span>
        </Bubble>
        <Bubble from="bot">
          Watching. Checked every 60 s.
          <br />
          LTV {pct(64.2)}, rings at {pct(LINE)}, liquidated at {pct(LIQUIDATED_AT)}
        </Bubble>
        <p className="self-center rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">Later</p>
        <Bubble from="bot" className="border-warning/32">
          Your Kamino position {POSITION} is at LTV {pct(71.2)}, over the line of {pct(LINE)}. It is liquidated at {pct(LIQUIDATED_AT)}.
          <br />
          It owes {usd.format(412.3)} against {usd.format(579.07)}.
          <br />
          Repay it from Base, Arbitrum or Ethereum with one signature, about 3 minutes to land:{' '}
          {/* the alert links to the site that runs the watcher, this one */}
          <span className="text-accent underline decoration-accent/40 underline-offset-2 [overflow-wrap:anywhere]">
            {location.origin}/kamino?wallet={WALLET}&amp;obligation={POSITION}
          </span>
        </Bubble>
      </div>
      <figcaption className="border-t border-border px-4 py-2.5 text-xs text-muted">The bot&apos;s own words. The wallet, the position and the figures are an example.</figcaption>
    </figure>
  );
}

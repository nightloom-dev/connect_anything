import type { CSSProperties } from 'react';
import { cn } from '../../ui/cn.ts';
import { siteAddress } from './site.ts';

// The Telegram watcher of apps/watch at work, drawn as a plot: the LTV of a Kamino position over 40 minutes, the line
// where the bot rings, its alert, and the repay that brings the position back. The alert's words are the bot's own
// (alertText in apps/watch); the wallet, the position and the figures are an example, and the caption says so. The bot
// has no fixed username: whoever runs the watcher makes their own with @BotFather.

const WALLET = '7xKX…gAsU';
const POSITION = 'Hx3m…9cQe';
const LIQUIDATED_AT = 80;
// the default line: 10 points under the liquidation LTV
const LINE = LIQUIDATED_AT - 10;
// The alert links to the site that runs the watcher. VITE_PUBLIC_URL names it, as PUBLIC_URL does for apps/watch, so that
// a page opened on localhost shows the public address; without it, the page's own.
const SITE = siteAddress(import.meta.env.VITE_PUBLIC_URL, location.origin);

// one decimal, as the bot's percent() writes it
const tenths = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (value: number) => `${tenths.format(value)}%`;
// two decimals and no grouping, as the bot's toFixed(2) writes them
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', useGrouping: false });

/** The LTV, in %, minute by minute from 12:00: /watch at 12:10, the alert at 12:26, the tap at 12:27, the repay at 12:30. */
const LTV: [minute: number, ltv: number][] = [
  [0, 61],
  [5, 62.4],
  [10, 64.2],
  [15, 65.5],
  [20, 67.9],
  [24, 69.4],
  [26, 71.2],
  [27, 71.6],
  [30, 71.6],
  [30, 50],
  [33, 50.3],
  [36, 50.1],
  [40, 50.2],
];
const WATCHED = 10;
const ALERTED = 26;
const at = (minute: number) => LTV.find(([m]) => m === minute)![1];

const PLOT_LABEL = `An example over 40 minutes: the LTV of a Kamino position climbs from ${pct(61)}. The bot is told to watch it at ${pct(at(WATCHED))}, rings once it is over ${pct(LINE)}, and the repay paid from the link brings it down to ${pct(50)}, well before the liquidation at ${pct(LIQUIDATED_AT)}.`;

type Frame = {
  /** The viewBox. */
  box: string;
  x: (minute: number) => number;
  y: (ltv: number) => number;
  className: string;
};

const path = ({ x, y }: Frame) => LTV.map(([minute, ltv], index) => `${index ? 'L' : 'M'}${x(minute).toFixed(1)} ${y(ltv).toFixed(1)}`).join('');

/**
 * How far along the line a minute is, as a share of its length: the plot is drawn as it scrolls in (landing.css), and
 * the mark of that minute comes when the line gets to it.
 */
const along = ({ x, y }: Frame, minute: number): CSSProperties => {
  const points = LTV.map(([m, ltv]) => [x(m), y(ltv)]);
  const steps = points.map(([px, py], index) => (index ? Math.hypot(px - points[index - 1][0], py - points[index - 1][1]) : 0));
  const upTo = steps.slice(0, LTV.findIndex(([m]) => m === minute) + 1).reduce((sum, step) => sum + step, 0);
  return { '--at': (upTo / steps.reduce((sum, step) => sum + step, 0)).toFixed(3) } as CSSProperties;
};

/** Across, 1000 wide, from 960 px: every label. */
function PlotWide() {
  const f: Frame = { box: '0 120 1000 300', x: m => 60 + 22 * m, y: ltv => 390 - ((ltv - 40) * 16) / 3, className: 'hidden md:block' };
  const { x, y } = f;
  const line = path(f);
  return (
    <svg viewBox={f.box} role="img" aria-label={PLOT_LABEL} className={cn('ltv h-auto w-full overflow-visible', f.className)}>
      <path className="lt-grid" d={`M60 ${y(50)}H940M60 ${y(60)}H940`} />
      <path className="lt-liq" d={`M60 ${y(LIQUIDATED_AT)}H940`} />
      <path className="lt-watch" d={`M60 ${y(LINE)}H940`} />
      <path className="lt-area" d={`${line}V${y(40)}H60Z`} />
      <path className="lt-line" d={line} pathLength={1} />
      <path className="lt-axis" d={`M60 150V${y(40)}H940`} />
      {[40, 50, 60, 70, 80].map(ltv => (
        <text key={ltv} x="50" y={y(ltv) + 4} textAnchor="end">
          {ltv}%
        </text>
      ))}
      <text className="lt-liq-t" x="940" y={y(LIQUIDATED_AT) - 7} textAnchor="end">
        liquidated at {pct(LIQUIDATED_AT)}
      </text>
      <text className="lt-watch-t" x="940" y={y(LINE) - 7} textAnchor="end">
        rings at {pct(LINE)}
      </text>
      {[0, 10, 20, 30, 40].map(minute => (
        <text key={minute} x={x(minute)} y="412" textAnchor={minute === 0 ? 'start' : minute === 40 ? 'end' : 'middle'}>
          12:{String(minute).padStart(2, '0')}
        </text>
      ))}
      <circle className="lt-hollow" cx={x(WATCHED)} cy={y(at(WATCHED))} r="5" style={along(f, WATCHED)} />
      <text className="lt-ink" x={x(WATCHED)} y={y(at(WATCHED)) - 15} textAnchor="middle">
        /watch · {pct(at(WATCHED))}
      </text>
      <path className="lt-leader" d={`M${x(ALERTED)} 120V${y(at(ALERTED)) - 8}`} pathLength={1} style={along(f, ALERTED)} />
      <circle className="lt-alert" cx={x(ALERTED)} cy={y(at(ALERTED))} r="6" style={along(f, ALERTED)} />
      <text className="lt-ink" x={x(30) - 12} y={y(56)} textAnchor="end">
        repay lands ≈3 min after the tap
      </text>
      <text className="lt-ink" x="940" y={y(50) - 11} textAnchor="end">
        LTV {pct(50)}
      </text>
    </svg>
  );
}

/** Narrow, 400 wide, under 960 px: fewer labels, larger. */
function PlotNarrow() {
  const f: Frame = { box: '0 0 400 250', x: m => 44 + 8.5 * m, y: ltv => 220 - (ltv - 40) * 4.5, className: 'md:hidden' };
  const { x, y } = f;
  const line = path(f);
  return (
    <svg viewBox={f.box} role="img" aria-label={PLOT_LABEL} className={cn('ltv ltv-narrow h-auto w-full overflow-visible', f.className)}>
      <path className="lt-grid" d={`M44 ${y(50)}H384M44 ${y(60)}H384`} />
      <path className="lt-liq" d={`M44 ${y(LIQUIDATED_AT)}H384`} />
      <path className="lt-watch" d={`M44 ${y(LINE)}H384`} />
      <path className="lt-area" d={`${line}V${y(40)}H44Z`} />
      <path className="lt-line" d={line} pathLength={1} />
      <path className="lt-axis" d={`M44 20V${y(40)}H384`} />
      {[40, 50, 60, 70, 80].map(ltv => (
        <text key={ltv} x="36" y={y(ltv) + 4} textAnchor="end">
          {ltv}%
        </text>
      ))}
      <text className="lt-liq-t" x="50" y={y(LIQUIDATED_AT) - 7}>
        liquidated at {pct(LIQUIDATED_AT)}
      </text>
      <text className="lt-watch-t" x="50" y={y(LINE) - 7}>
        rings at {pct(LINE)}
      </text>
      {[0, 20, 40].map(minute => (
        <text key={minute} x={x(minute)} y="242" textAnchor={minute === 0 ? 'start' : minute === 40 ? 'end' : 'middle'}>
          12:{String(minute).padStart(2, '0')}
        </text>
      ))}
      <circle className="lt-hollow" cx={x(WATCHED)} cy={y(at(WATCHED))} r="4" style={along(f, WATCHED)} />
      <path className="lt-leader" d={`M${x(ALERTED)} 0V${y(at(ALERTED)) - 7}`} pathLength={1} style={along(f, ALERTED)} />
      <circle className="lt-alert" cx={x(ALERTED)} cy={y(at(ALERTED))} r="5" style={along(f, ALERTED)} />
      <text className="lt-ink" x={x(30) - 8} y={y(56)} textAnchor="end">
        repay lands, ≈3 min
      </text>
      <text className="lt-ink" x="384" y={y(50) - 8} textAnchor="end">
        LTV {pct(50)}
      </text>
    </svg>
  );
}

/** The alert as the bot sends it, over the plot, and the plot under it: its leader points at the moment it was sent. */
export function WatcherPlot({ className }: { className?: string }) {
  return (
    <figure className={cn('flex min-w-0 flex-col', className)}>
      <div className="relative z-10 flex flex-col gap-1.5 border border-text bg-surface px-4 pt-2.5 pb-3 md:ml-[calc(63.2%-11rem)] md:w-[min(30rem,60%)]">
        <p className="label-caps flex justify-between gap-3 text-muted">
          <span>Kamino watcher · bot</span>
          <span>12:{ALERTED}</span>
        </p>
        <p className="text-sm leading-[1.55] text-text">
          Your Kamino position {POSITION} is at LTV {pct(at(ALERTED))}, over the line of {pct(LINE)}. It is liquidated at {pct(LIQUIDATED_AT)}.
          <br />
          It owes {usd.format(412.3)} against {usd.format(579.07)}.
          <br />
          Repay it from Base, Arbitrum or Ethereum with one signature, about 3 minutes to land:{' '}
          <span className="font-mono text-[0.8125rem] text-accent underline decoration-accent/40 underline-offset-2 [overflow-wrap:anywhere]">
            {SITE}/kamino?wallet={WALLET}&amp;obligation={POSITION}
          </span>
        </p>
      </div>
      <PlotWide />
      <PlotNarrow />
      <figcaption className="mt-3 text-xs text-muted">The bot&apos;s own words. The wallet, the position and the figures are an example.</figcaption>
    </figure>
  );
}

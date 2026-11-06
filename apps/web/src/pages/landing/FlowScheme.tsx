import { useId, type CSSProperties } from 'react';
import { cn } from '../../ui/cn.ts';
import { SOURCE_CHAINS, VERIFIED } from './facts.ts';

// The hero's picture of a run: three EVM chains, Intents Connect, and the instructions of a Kamino repay on Solana.
// The first paint has all of it but the run: the chains, the faint tracks, Intents Connect and the program with its
// instructions. Then the run plays once, in 1.2 s (styles/landing.css): the money lights the tracks to Connect and on to
// Solana, and each instruction gets its check. With prefers-reduced-motion, or `still`, it is drawn in its final state:
// every element's own style is the end of its animation.

const KLEND = VERIFIED[0];

const delay = (seconds: number): CSSProperties => ({ animationDelay: `${seconds}s` });

// 400 × 380 units: the chains on top, Intents Connect in the middle, the program at the bottom
const CHIP = { width: 116, height: 44, y: 8 };
const CHIPS = SOURCE_CHAINS.map((chain, index) => ({ ...chain, x: 8 + index * 134 }));
const HUB = { x: 90, y: 128, width: 220, height: 56 };
const CARD = { x: 40, y: 228, width: 320, height: 144 };
const MID = 200;

const inbound = CHIPS.map(({ x }) => {
  const from = x + CHIP.width / 2;
  const top = CHIP.y + CHIP.height;
  return from === MID ? `M${from} ${top} L${MID} ${HUB.y}` : `M${from} ${top} C${from} ${top + 40} ${MID} ${HUB.y - 40} ${MID} ${HUB.y}`;
});
const outbound = `M${MID} ${HUB.y + HUB.height} L${MID} ${CARD.y}`;

export function FlowScheme({ className, still = false }: { className?: string; /** Drawn in its final state, as for the OG image. */ still?: boolean }) {
  const id = useId().replace(/:/g, '');
  const brand = `${id}-brand`;
  const ring = `${id}-ring`;
  const glow = `${id}-glow`;
  const title = `${id}-title`;
  return (
    <svg viewBox="0 0 400 380" role="img" aria-labelledby={title} className={cn('flow h-auto w-full select-none', still && 'flow-still', className)}>
      <title id={title}>
        One payment from Base, Arbitrum or Ethereum goes through Intents Connect to a program on Solana: here the four instructions of a Kamino repay.
      </title>
      <defs>
        <linearGradient id={brand} gradientUnits="userSpaceOnUse" x1="0" y1={CHIP.y + CHIP.height} x2="0" y2={CARD.y}>
          <stop offset="0" style={{ stopColor: 'var(--color-brand-from)' }} />
          <stop offset="1" style={{ stopColor: 'var(--color-brand-to)' }} />
        </linearGradient>
        <linearGradient id={ring} gradientUnits="userSpaceOnUse" x1={HUB.x} y1="0" x2={HUB.x + HUB.width} y2="0">
          <stop offset="0" style={{ stopColor: 'var(--color-brand-from)' }} />
          <stop offset="1" style={{ stopColor: 'var(--color-brand-to)' }} />
        </linearGradient>
        <filter id={glow} x="-30%" y="-80%" width="160%" height="260%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>

      {/* the tracks, faint, so the shape reads before the lines are drawn */}
      <g className="fill-none stroke-border-strong" strokeWidth="1.5" strokeDasharray="2 5" strokeLinecap="round">
        {inbound.map(d => (
          <path key={d} d={d} />
        ))}
        <path d={outbound} />
      </g>

      {/* the chains */}
      {CHIPS.map(({ id: chain, name, icon, x }) => (
        <g key={chain}>
          <rect x={x + 0.5} y={CHIP.y + 0.5} width={CHIP.width - 1} height={CHIP.height - 1} rx="11" className="fill-surface-2 stroke-border-strong" />
          <image href={icon} x={x + 12} y={CHIP.y + 12} width="20" height="20" />
          <text x={x + 40} y={CHIP.y + 27} fontSize="13" fontWeight="600" className="fill-text">
            {name}
          </text>
        </g>
      ))}

      {/* the money, on its way to Connect */}
      <g fill="none" strokeWidth="2" strokeLinecap="round">
        {inbound.map((d, index) => (
          <path key={d} d={d} pathLength={1} stroke={`url(#${brand})`} className="flow-draw" style={delay(index * 0.06)} />
        ))}
        {inbound.map((d, index) => (
          <path key={d} d={d} pathLength={1} strokeWidth="3" className="flow-pulse stroke-white" style={delay(0.12 + index * 0.06)} />
        ))}
      </g>

      {/* Intents Connect */}
      <rect x={HUB.x + 10} y={HUB.y + 8} width={HUB.width - 20} height={HUB.height - 16} rx="20" fill={`url(#${ring})`} opacity="0.35" filter={`url(#${glow})`} className="flow-in" style={delay(0.35)} />
      <rect x={HUB.x} y={HUB.y} width={HUB.width} height={HUB.height} rx={HUB.height / 2} fill="none" stroke={`url(#${ring})`} strokeWidth="2" className="flow-ping" style={delay(0.45)} />
      <g>
        <rect x={HUB.x + 0.75} y={HUB.y + 0.75} width={HUB.width - 1.5} height={HUB.height - 1.5} rx={(HUB.height - 1.5) / 2} stroke={`url(#${ring})`} strokeWidth="1.5" className="fill-surface-2" />
        <circle cx={HUB.x + 28} cy={HUB.y + HUB.height / 2} r="12" fill="none" stroke={`url(#${ring})`} strokeWidth="2" />
        <circle cx={HUB.x + 28} cy={HUB.y + HUB.height / 2} r="4" className="fill-brand-to" />
        <text x={HUB.x + 52} y={HUB.y + 25} fontSize="14" fontWeight="600" className="fill-text">
          Intents Connect
        </text>
        <text x={HUB.x + 52} y={HUB.y + 41} fontSize="11" className="fill-muted">
          bridge and MPC signature
        </text>
      </g>

      {/* on to Solana */}
      <path d={outbound} pathLength={1} fill="none" stroke={`url(#${brand})`} strokeWidth="2" strokeLinecap="round" className="flow-draw" style={delay(0.5)} />
      <path d={outbound} pathLength={1} fill="none" strokeWidth="3" strokeLinecap="round" className="flow-pulse stroke-white" style={delay(0.55)} />
      <text x={MID + 10} y={HUB.y + HUB.height + 26} fontSize="11" className="fill-muted nums">
        ≈150 s
      </text>

      {/* the program, and what it ran */}
      <g>
        <rect x={CARD.x + 0.5} y={CARD.y + 0.5} width={CARD.width - 1} height={CARD.height - 1} rx="14" className="fill-surface stroke-border-strong" />
        <image href="/icons/solana.svg" x={CARD.x + 16} y={CARD.y + 12} width="20" height="20" />
        <text x={CARD.x + 44} y={CARD.y + 27} fontSize="13.5" fontWeight="600" className="fill-text">
          Solana program
        </text>
        <text x={CARD.x + CARD.width - 16} y={CARD.y + 27} fontSize="11.5" textAnchor="end" className="fill-muted">
          {KLEND.name}
        </text>
        <line x1={CARD.x} x2={CARD.x + CARD.width} y1={CARD.y + 44} y2={CARD.y + 44} className="stroke-border" />
      </g>
      {KLEND.instructions.map((name, index) => {
        const y = CARD.y + 70 + index * 25;
        const right = CARD.x + CARD.width - 24;
        return (
          <g key={name}>
            <text x={CARD.x + 18} y={y} fontSize="11.5" className="fill-text font-mono">
              {name}
            </text>
            <g className="flow-pop" style={delay(0.75 + index * 0.08)}>
              <circle cx={right} cy={y - 4} r="8" className="fill-success/16" />
              <path d={`M${right - 4} ${y - 4} l3 3 l5 -6`} fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="stroke-success" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

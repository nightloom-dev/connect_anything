import { useId, type CSSProperties } from 'react';
import { CU_LIMIT } from '../../limits.ts';
import { cn } from '../../ui/cn.ts';
import { VERIFIED } from './facts.ts';

// The landing page's hero drawing: one run from an EVM chain, through Intents Connect, to a program on Solana.
// Laid out across from 960 px and top to bottom below that; styles in styles/landing.css. The animation finishes within
// 1.2 s of the first paint, `slow` replays it, and SourcePicker puts a button over each chain to pick the source.

export const SCHEME_TITLE =
  'One payment from Base, Arbitrum or Ethereum goes through Intents Connect to a program on Solana: here the four instructions of a Kamino repay.';

export const CALLOUTS = [
  ['Sign once on Base, Arbitrum or Ethereum.', 'No Solana wallet, no SOL.'],
  ['Intents Connect bridges the money', 'and signs on Solana with MPC.'],
  ['Any Anchor program runs on Solana.', 'Here, a Kamino repay in 4 instructions.'],
] as const;

export const SOURCES = ['Base', 'Arbitrum', 'Ethereum'] as const;
export type Source = (typeof SOURCES)[number];

const INSTRUCTIONS = ['refresh_reserve ×2', 'refresh_obligation', 'repay_obligation_liquidity_v2'];
// the Kamino repay of the proof table, against what Connect allows
const CU_SHARE = VERIFIED[0].computeUnits / CU_LIMIT;
/** How much slower Run again plays, so that the eye can follow the callouts. */
const SLOW = 1.8;

/** The top of each chain's box in the route across, which the callouts push 70 down, and the left of each in the narrow one. */
const ROWS = [52, 127, 202];
const ROUTE_TOP = 70;
const COLUMNS = [10, 150, 290];
/** The chains' boxes as [x, y, width, height] on each drawing's viewBox: where SourcePicker puts its buttons. */
const BOXES = {
  across: { width: 1000, height: 440, boxes: ROWS.map(y => [20, y + ROUTE_TOP, 180, 46]) },
  narrow: { width: 420, height: 312, boxes: COLUMNS.map(x => [x, 10, 120, 36]) },
};

/** The run as [start, length] in seconds from the first paint. The last part ends at 1.18 s. */
const RUN = {
  sign: [0, 0.45], // the chain's dot and callout 1
  toHub: [0, 0.42], // the line to Intents Connect, with the payment at its head
  hub: [0.4, 0.6], // Intents Connect rings as the payment arrives
  bridge: [0.4, 0.45], // callout 2
  toProgram: [0.48, 0.3],
  // one check per instruction
  checks: [
    [0.78, 0.22],
    [0.86, 0.22],
    [0.94, 0.22],
  ],
  units: [0.8, 0.36],
  program: [0.73, 0.45], // callout 3
} satisfies Record<string, [number, number] | [number, number][]>;

/** The animation's start and length as an inline style: `--flow-k` on the drawing stretches both. */
const play = ([start, length]: readonly [number, number]): CSSProperties => ({
  animationDelay: `calc(${start}s * var(--flow-k, 1))`,
  animationDuration: `calc(${length}s * var(--flow-k, 1))`,
});

type Point = readonly [number, number];

/** A path of straight lines through the points, and its length, for a payment the same size on any of them. */
function route(points: Point[]) {
  const kept = points.filter((point, index) => index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1]);
  const length = kept.slice(1).reduce((sum, [x, y], index) => sum + Math.hypot(x - kept[index][0], y - kept[index][1]), 0);
  return { d: `M${kept.map(point => point.join(' ')).join('L')}`, length };
}

/** The payment: a short bead at the head of the line as it is drawn, gone once it arrives. */
function Packet({ d, length, at }: { d: string; length: number; at: readonly [number, number] }) {
  const bead = Math.min(11 / length, 0.4).toFixed(4);
  return <path className="fs-packet flow-packet" pathLength={1} d={d} style={{ ...play(at), '--bead': bead } as CSSProperties} />;
}

/** A line of the run, drawn as the payment goes, with the payment on it. */
function Run({ points, at, still }: { points: Point[]; at: readonly [number, number]; still?: boolean }) {
  const { d, length } = route(points);
  return (
    <>
      <path className={cn('fs-run', !still && 'flow-draw')} style={still ? undefined : play(at)} pathLength={1} d={d} />
      {!still && <Packet d={d} length={length} at={at} />}
    </>
  );
}

/** A check mark whose short arm starts at (x, y). */
const Check = ({ x, y, at, still }: { x: number; y: number; at: readonly [number, number]; still?: boolean }) => (
  <path className={cn('fs-ok', !still && 'flow-pop')} style={still ? undefined : play(at)} d={`M${x} ${y}l4 4 8-8`} />
);

/** The route across, 1000 × 300: Base, Arbitrum and Ethereum, Intents Connect, the program. */
function RouteAcross({ source, still }: { source: Source; still?: boolean }) {
  const rows = ROWS;
  const from = SOURCES.indexOf(source);
  return (
    <>
      <text className="fs-col" x="20" y="18">
        SOURCE · EVM
      </text>
      <text className="fs-col" x="400" y="18">
        BRIDGE
      </text>
      <text className="fs-col" x="700" y="18">
        TARGET · SOLANA
      </text>
      <path className="fs-hair" d="M20 30H980" />

      {rows.map((y, index) => (
        <g key={y}>
          <rect className="fs-node" x="20" y={y} width="180" height="46" />
          <circle className={cn(index === from ? 'fs-dot-on' : 'fs-dot', index === from && !still && 'flow-pop')} style={index === from && !still ? play(RUN.sign) : undefined} cx="44" cy={y + 23} r="6" />
          <text className="fs-chain" x="60" y={y + 28}>
            {SOURCES[index]}
          </text>
        </g>
      ))}

      {/* the ways every other chain could take, dashed, and over them the run from the one it takes */}
      <path className="fs-bus" d={rows.filter((_, index) => index !== from).map(y => `M200 ${y + 23}H290V150`).join('')} />
      <Run points={[[200, rows[from] + 23], [290, rows[from] + 23], [290, 150], [400, 150]]} at={RUN.toHub} still={still} />
      <circle className="fs-junction" cx="290" cy="150" r="3.5" />

      <rect className="fs-hub" x="400" y="118" width="200" height="64" />
      {!still && <rect className="fs-ping flow-ping" style={play(RUN.hub)} x="400" y="118" width="200" height="64" />}
      <text className="fs-hub-t" x="500" y="146" textAnchor="middle">
        Intents Connect
      </text>
      <text className="fs-sub" x="500" y="166" textAnchor="middle">
        bridge + MPC signature
      </text>

      <Run points={[[600, 150], [696, 150]]} at={RUN.toProgram} still={still} />
      <path className="fs-arrow" d="M687 144L698 150L687 156" />

      {/* dimension lines: the time after the deposit, and the one signature it takes */}
      <path className="fs-dim" d="M600 114V98M700 114V98M600 106H700M596 110L604 102M696 110L704 102" />
      <text className="fs-dim-t" x="650" y="96" textAnchor="middle">
        ≈150 s
      </text>
      <path className="fs-dim" d="M200 254V280M400 186V280M200 274H400M196 278L204 270M396 278L404 270" />
      <text className="fs-dim-t" x="300" y="268" textAnchor="middle">
        1 signature
      </text>

      <rect className="fs-node" x="700" y="52" width="280" height="196" />
      <text className="fs-pt" x="718" y="78">
        Solana program
      </text>
      <text className="fs-sub" x="962" y="78" textAnchor="end">
        Kamino Lend
      </text>
      <path className="fs-hair" d="M700 92H980" />
      {INSTRUCTIONS.map((name, index) => (
        <g key={name}>
          <text x="718" y={120 + index * 24}>
            {name}
          </text>
          <Check x={944} y={115 + index * 24} at={RUN.checks[index]} still={still} />
        </g>
      ))}
      <path className="fs-hair" d="M700 186H980" />
      <text className="fs-sub" x="718" y="207">
        115,948 / 200,000 CU
      </text>
      <text className="fs-sub" x="962" y="207" textAnchor="end">
        934 / 1,232 B
      </text>
      <rect className="fs-bar" x="718" y="219" width="244" height="8" />
      <rect className={cn('fs-barfill', !still && 'flow-grow')} style={still ? undefined : play(RUN.units)} x="718.5" y="219.5" width={(243 * CU_SHARE).toFixed(1)} height="7" />
    </>
  );
}

/** A numbered circle, as the callouts and the list under the narrow drawing have. It lights while the run is at it. */
const Num = ({ x, y, n, r = 11, at, still }: { x: number; y: number; n: number; r?: number; at: readonly [number, number]; still?: boolean }) => (
  <>
    <circle className={cn('fs-num', !still && 'flow-light')} style={still ? undefined : play(at)} cx={x} cy={y} r={r} />
    <text className="fs-num-t" x={x} y={y + 4} textAnchor="middle">
      {n}
    </text>
  </>
);

/** A callout's leader and the dot it starts from, lit with its number. */
const Leader = ({ d, x, y, at, still }: { d: string; x: number; y: number; at: readonly [number, number]; still?: boolean }) => (
  <>
    <path className={cn('fs-leader', !still && 'flow-light-line')} style={still ? undefined : play(at)} d={d} />
    <circle className={cn('fs-anchor', !still && 'flow-light')} style={still ? undefined : play(at)} cx={x} cy={y} r="3.5" />
  </>
);

type SchemeProps = {
  /** The chain the run starts from. */
  source?: Source;
  /** Run again: the same run, slower. */
  slow?: boolean;
  /** No run at all, for a picture. */
  still?: boolean;
  className?: string;
};

/**
 * The route across with its three callouts, 1000 × 440. `callouts={false}` draws the route alone, 1000 × 300, for the
 * link preview (pages/OgImage.tsx). Its display is the caller's: block, or hidden under a breakpoint. A new key plays the
 * run again.
 */
export function FlowScheme({ source = 'Base', slow = false, still = false, callouts = true, className }: SchemeProps & { callouts?: boolean }) {
  const id = useId();
  return (
    <svg
      viewBox={callouts ? '0 0 1000 440' : '0 0 1000 300'}
      role="img"
      aria-labelledby={id}
      className={cn('flow h-auto w-full overflow-visible', still && 'flow-still', className)}
      style={slow ? ({ '--flow-k': SLOW } as CSSProperties) : undefined}
    >
      <title id={id}>{SCHEME_TITLE}</title>
      {callouts ? (
        <>
          <g transform={`translate(0 ${ROUTE_TOP})`}>
            <RouteAcross source={source} still={still} />
          </g>
          <Leader d="M150 122V66H470" x={150} y={122} at={RUN.sign} still={still} />
          <Num x={162} y={30} n={1} at={RUN.sign} still={still} />
          <text className="fs-call" x="182" y="35">
            {CALLOUTS[0][0]}
          </text>
          <text className="fs-call" x="182" y="56">
            {CALLOUTS[0][1]}
          </text>

          <Leader d="M520 252V372H880" x={520} y={252} at={RUN.bridge} still={still} />
          <Num x={546} y={400} n={2} at={RUN.bridge} still={still} />
          <text className="fs-call" x="566" y="405">
            {CALLOUTS[1][0]}
          </text>
          <text className="fs-call" x="566" y="426">
            {CALLOUTS[1][1]}
          </text>

          <Leader d="M900 122V66H580" x={900} y={122} at={RUN.program} still={still} />
          <Num x={592} y={30} n={3} at={RUN.program} still={still} />
          <text className="fs-call" x="612" y="35">
            {CALLOUTS[2][0]}
          </text>
          <text className="fs-call" x="612" y="56">
            {CALLOUTS[2][1]}
          </text>
        </>
      ) : (
        <RouteAcross source={source} still={still} />
      )}
    </svg>
  );
}

/** The same route top to bottom, 420 × 312, for a screen under 960 px: the numbers point to the list under it. */
export function FlowSchemeNarrow({ source = 'Base', slow = false, className }: Omit<SchemeProps, 'still'>) {
  const id = useId();
  // the left edge of each chain's box; its way down starts from the middle, 60 further
  const columns = COLUMNS;
  const from = SOURCES.indexOf(source);
  return (
    <svg
      viewBox="0 0 420 312"
      role="img"
      aria-labelledby={id}
      className={cn('flow flow-narrow block h-auto w-full overflow-visible', className)}
      style={slow ? ({ '--flow-k': SLOW } as CSSProperties) : undefined}
    >
      <title id={id}>{SCHEME_TITLE}</title>
      <path className="fs-bus" d={columns.filter((_, index) => index !== from).map(x => `M${x + 60} 46V73H210`).join('')} />
      <Run points={[[columns[from] + 60, 46], [columns[from] + 60, 73], [210, 73], [210, 100]]} at={RUN.toHub} />
      <circle className="fs-junction" cx="210" cy="73" r="3" />
      {columns.map((x, index) => (
        <g key={x}>
          <rect className="fs-node" x={x} y="10" width="120" height="36" />
          <circle className={cn(index === from ? 'fs-dot-on flow-pop' : 'fs-dot')} style={index === from ? play(RUN.sign) : undefined} cx={x + 20} cy="28" r="6" />
          <text className="fs-chain" x={x + 34} y="33">
            {SOURCES[index]}
          </text>
        </g>
      ))}
      <Num x={34} y={73} n={1} r={10} at={RUN.sign} />

      <rect className="fs-hub" x="105" y="100" width="210" height="50" />
      <rect className="fs-ping flow-ping" style={play(RUN.hub)} x="105" y="100" width="210" height="50" />
      <text className="fs-hub-t" x="210" y="122" textAnchor="middle">
        Intents Connect
      </text>
      <text className="fs-sub" x="210" y="140" textAnchor="middle">
        bridge + MPC signature
      </text>
      <Num x={80} y={125} n={2} r={10} at={RUN.bridge} />

      <Run points={[[210, 150], [210, 189]]} at={RUN.toProgram} />
      <path className="fs-arrow" d="M204 182L210 192L216 182" />
      <path className="fs-dim" d="M244 155V187M239 155H249M239 187H249" />
      <text className="fs-dim-t" x="256" y="175">
        ≈150 s
      </text>

      <rect className="fs-node" x="50" y="192" width="320" height="112" />
      <text className="fs-pt" x="68" y="216">
        Solana program
      </text>
      <text className="fs-sub" x="352" y="216" textAnchor="end">
        Kamino Lend
      </text>
      <path className="fs-hair" d="M50 228H370" />
      {INSTRUCTIONS.map((name, index) => (
        <g key={name}>
          <text className="fs-ix" x="68" y={252 + index * 20}>
            {name}
          </text>
          <Check x={343} y={247 + index * 20} at={RUN.checks[index]} />
        </g>
      ))}
      <Num x={28} y={248} n={3} r={10} at={RUN.program} />
    </svg>
  );
}

const share = (part: number, whole: number) => `${((part / whole) * 100).toFixed(3)}%`;

/**
 * The chains' boxes of a drawing as buttons, laid over it: pressing one plays the run from that chain. They are not in
 * the drawing, which a new run draws anew, so that the focus stays on the button that was pressed. The caller puts the
 * drawing and this in a `relative` box as large as the drawing.
 */
export function SourcePicker({ layout, source, onSource }: { layout: keyof typeof BOXES; source: Source; onSource: (source: Source) => void }) {
  const { width, height, boxes } = BOXES[layout];
  return (
    <div role="group" aria-label="Pay from" className="pointer-events-none absolute inset-0">
      {SOURCES.map((chain, index) => {
        const [x, y, w, h] = boxes[index];
        return (
          <button
            key={chain}
            type="button"
            aria-pressed={chain === source}
            onClick={() => onSource(chain)}
            // the chosen one is edged in cobalt, as its run is; a phone gets 6 px more above and below to tap
            className="pointer-events-auto absolute cursor-pointer transition-[background-color,box-shadow] duration-120 ease-out before:absolute before:inset-x-0 before:-inset-y-1.5 hover:bg-accent/6 aria-pressed:shadow-[inset_0_0_0_1.5px_var(--color-accent)] md:before:hidden"
            style={{ left: share(x, width), top: share(y, height), width: share(w, width), height: share(h, height) }}
          >
            <span className="sr-only">{chain}</span>
          </button>
        );
      })}
    </div>
  );
}

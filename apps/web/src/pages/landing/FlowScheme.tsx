import { useId } from 'react';
import { cn } from '../../ui/cn.ts';

// The hero drawing of the landing page: the route of one run, from the EVM chain you sign on, through Intents Connect,
// to the program on Solana. Two drawings of the same route: across, with three numbered callouts, from 960 px; top to
// bottom on a narrower screen, where the callouts are a list under it (Landing.tsx). Its styles are in
// styles/landing.css. Everything is drawn at the first paint; only the run itself plays, once, and is over in 1.2 s.

export const SCHEME_TITLE =
  'One payment from Base, Arbitrum or Ethereum goes through Intents Connect to a program on Solana: here the four instructions of a Kamino repay.';

export const CALLOUTS = [
  ['Sign once on Base, Arbitrum or Ethereum.', 'No Solana wallet, no SOL.'],
  ['Intents Connect bridges the money', 'and signs on Solana with MPC.'],
  ['Any Anchor program runs on Solana.', 'Here, a Kamino repay in 4 instructions.'],
] as const;

const CHAINS = ['Base', 'Arbitrum', 'Ethereum'];
const INSTRUCTIONS = ['refresh_reserve ×2', 'refresh_obligation', 'repay_obligation_liquidity_v2'];
// 115,948 of the 200,000 compute units Connect allows for one transaction
const CU_SHARE = 115_948 / 200_000;
/** When each instruction gets its check, in seconds. */
const CHECKED_AT = [0.7, 0.8, 0.9];

const delay = (seconds: number) => ({ animationDelay: `${seconds}s` });

/** A check mark whose short arm starts at (x, y). */
const Check = ({ x, y, at, still }: { x: number; y: number; at: number; still?: boolean }) => (
  <path className={cn('fs-ok', !still && 'flow-pop')} style={delay(at)} d={`M${x} ${y}l4 4 8-8`} />
);

/** The route across, 1000 × 300: Base, Arbitrum and Ethereum, Intents Connect, the program. */
function RouteAcross({ still }: { still?: boolean }) {
  const rows = [52, 127, 202];
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
          <circle className={index === 0 ? 'fs-dot-on' : 'fs-dot'} cx="44" cy={y + 23} r="6" />
          <text className="fs-chain" x="60" y={y + 28}>
            {CHAINS[index]}
          </text>
        </g>
      ))}

      {/* the bus every chain can take, and over it the run from Base */}
      <path className="fs-bus" d="M200 150H290M200 225H290V150" />
      <path className={cn('fs-run', !still && 'flow-draw')} pathLength={1} d="M200 75H290V150H400" />
      <circle className="fs-junction" cx="290" cy="150" r="3.5" />

      <rect className="fs-hub" x="400" y="118" width="200" height="64" />
      {!still && <rect className="fs-ping flow-ping" style={delay(0.42)} x="400" y="118" width="200" height="64" />}
      <text className="fs-hub-t" x="500" y="146" textAnchor="middle">
        Intents Connect
      </text>
      <text className="fs-sub" x="500" y="166" textAnchor="middle">
        bridge + MPC signature
      </text>

      <path className={cn('fs-run', !still && 'flow-draw')} style={delay(0.45)} pathLength={1} d="M600 150H696" />
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
          <Check x={944} y={115 + index * 24} at={CHECKED_AT[index]} still={still} />
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
      <rect className={cn('fs-barfill', !still && 'flow-grow')} style={delay(0.72)} x="718.5" y="219.5" width={(243 * CU_SHARE).toFixed(1)} height="7" />
    </>
  );
}

/** A numbered circle, as the callouts and the list under the narrow drawing have. */
const Num = ({ x, y, n, r = 11 }: { x: number; y: number; n: number; r?: number }) => (
  <>
    <circle className="fs-num" cx={x} cy={y} r={r} />
    <text className="fs-num-t" x={x} y={y + 4} textAnchor="middle">
      {n}
    </text>
  </>
);

/**
 * The route across with its three callouts, 1000 × 440. `callouts={false}` draws the route alone, 1000 × 300, for the
 * link preview (pages/OgImage.tsx). `still` leaves out the run, for a picture. Its display is the caller's: block, or
 * hidden under a breakpoint.
 */
export function FlowScheme({ still = false, callouts = true, className }: { still?: boolean; callouts?: boolean; className?: string }) {
  const id = useId();
  return (
    <svg
      viewBox={callouts ? '0 0 1000 440' : '0 0 1000 300'}
      role="img"
      aria-labelledby={id}
      className={cn('flow h-auto w-full overflow-visible', still && 'flow-still', className)}
    >
      <title id={id}>{SCHEME_TITLE}</title>
      {callouts ? (
        <>
          <g transform="translate(0 70)">
            <RouteAcross still={still} />
          </g>
          <path className="fs-leader" d="M150 122V66H470" />
          <circle className="fs-anchor" cx="150" cy="122" r="3.5" />
          <Num x={162} y={30} n={1} />
          <text className="fs-call" x="182" y="35">
            {CALLOUTS[0][0]}
          </text>
          <text className="fs-call" x="182" y="56">
            {CALLOUTS[0][1]}
          </text>

          <path className="fs-leader" d="M520 252V372H880" />
          <circle className="fs-anchor" cx="520" cy="252" r="3.5" />
          <Num x={546} y={400} n={2} />
          <text className="fs-call" x="566" y="405">
            {CALLOUTS[1][0]}
          </text>
          <text className="fs-call" x="566" y="426">
            {CALLOUTS[1][1]}
          </text>

          <path className="fs-leader" d="M900 122V66H580" />
          <circle className="fs-anchor" cx="900" cy="122" r="3.5" />
          <Num x={592} y={30} n={3} />
          <text className="fs-call" x="612" y="35">
            {CALLOUTS[2][0]}
          </text>
          <text className="fs-call" x="612" y="56">
            {CALLOUTS[2][1]}
          </text>
        </>
      ) : (
        <RouteAcross still={still} />
      )}
    </svg>
  );
}

/** The same route top to bottom, 420 × 312, for a screen under 960 px: the numbers point to the list under it. */
export function FlowSchemeNarrow({ className }: { className?: string }) {
  const id = useId();
  const columns = [10, 150, 290];
  return (
    <svg viewBox="0 0 420 312" role="img" aria-labelledby={id} className={cn('flow flow-narrow block h-auto w-full overflow-visible', className)}>
      <title id={id}>{SCHEME_TITLE}</title>
      <path className="fs-bus" d="M210 46V73M350 46V73H210" />
      <path className="fs-run flow-draw" pathLength={1} d="M70 46V73H210V100" />
      <circle className="fs-junction" cx="210" cy="73" r="3" />
      {columns.map((x, index) => (
        <g key={x}>
          <rect className="fs-node" x={x} y="10" width="120" height="36" />
          <circle className={index === 0 ? 'fs-dot-on' : 'fs-dot'} cx={x + 20} cy="28" r="6" />
          <text className="fs-chain" x={x + 34} y="33">
            {CHAINS[index]}
          </text>
        </g>
      ))}
      <Num x={34} y={73} n={1} r={10} />

      <rect className="fs-hub" x="105" y="100" width="210" height="50" />
      <rect className="fs-ping flow-ping" style={delay(0.42)} x="105" y="100" width="210" height="50" />
      <text className="fs-hub-t" x="210" y="122" textAnchor="middle">
        Intents Connect
      </text>
      <text className="fs-sub" x="210" y="140" textAnchor="middle">
        bridge + MPC signature
      </text>
      <Num x={80} y={125} n={2} r={10} />

      <path className="fs-run flow-draw" style={delay(0.45)} pathLength={1} d="M210 150V189" />
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
          <Check x={343} y={247 + index * 20} at={CHECKED_AT[index]} />
        </g>
      ))}
      <Num x={28} y={248} n={3} r={10} />
    </svg>
  );
}

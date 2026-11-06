import { useId, type ReactNode } from 'react';
import { CircleOff, HandCoins, LockKeyhole } from 'lucide-react';
import { Disclosure } from '../../ui/index.ts';

function Item({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex size-4 shrink-0 text-muted [&>svg]:size-full" aria-hidden>
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}

/**
 * What decides whether to pay, in three points, and the reason behind them on demand. How long a run takes is said once,
 * in the payment card.
 */
export function BeforeYouPay() {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-lg border border-border bg-surface-2/50 px-4 py-3.5">
      <h4 id={id} className="text-sm font-semibold text-text">
        Before you pay
      </h4>
      <ul className="mt-2.5 flex flex-col gap-2 text-sm text-text/85">
        <Item icon={<HandCoins />}>It repays debt only: the collateral stays with the position's owner.</Item>
        <Item icon={<LockKeyhole />}>The amount is fixed when you sign. What is not spent can come back through Refund.</Item>
        <Item icon={<CircleOff />}>If nothing is owed by the time it lands, the run fails and the money waits for Refund.</Item>
      </ul>
      <Disclosure title="Why?" className="mt-3" panelClassName="text-sm leading-relaxed text-muted">
        <p>
          <strong className="font-semibold text-text">The position can move before this runs.</strong> The repay lands a while after you sign: the deposit, the bridge and the MPC signature come first, and the
          amount is fixed at the signature. In that time prices change, interest accrues, and the position can be liquidated or repaid by someone else, so the LTV you end up with can differ from the target.
          If less is owed by then, only what is owed gets repaid, and if nothing is, the run fails. Either way what is not spent stays with your intermediary until Refund takes it back. A repay pays off debt
          and nothing else: the collateral stays with the wallet that owns the position, even if that is not you.
        </p>
      </Disclosure>
    </section>
  );
}

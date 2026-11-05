import { useId, type ReactNode } from 'react';
import { Clock3, LockKeyhole, Undo2 } from 'lucide-react';
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
 * Three things to know before paying, and the whole reason behind a Why. `atLiquidation`: the position is already at
 * its liquidation LTV, which the reason then says too.
 */
export function BeforeYouPay({ atLiquidation }: { atLiquidation: boolean }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-lg border border-border bg-surface-2/50 px-4 py-3.5">
      <h4 id={id} className="text-sm font-semibold text-text">
        Before you pay
      </h4>
      <ul className="mt-2.5 flex flex-col gap-2 text-sm text-text/85">
        <Item icon={<Clock3 />}>It lands about 150 s after the deposit, plus the MPC signature.</Item>
        <Item icon={<LockKeyhole />}>The amount is fixed when you sign.</Item>
        <Item icon={<Undo2 />}>Whatever is not spent can come back to you through Refund.</Item>
      </ul>
      <Disclosure title="Why?" className="mt-3" panelClassName="text-sm leading-relaxed text-muted">
        <p>
          <strong className="font-semibold text-text">The position can move before this runs.</strong> After the deposit, execution takes about 150 seconds plus the MPC signature, and the amount is fixed when you sign. In
          that time prices change, interest accrues, and the position can be liquidated or repaid by someone else, so the LTV you end up with can differ from the target.
          {atLiquidation && ' This position is already at its liquidation LTV, so that can happen at any moment.'} If less is owed by then, only what is owed gets repaid, and if nothing is, the run fails. Either way
          what is not spent stays with your intermediary until Refund takes it back. A repay pays off debt and nothing else: the collateral stays with the wallet that owns the position, even if that is not you.
        </p>
      </Disclosure>
    </section>
  );
}

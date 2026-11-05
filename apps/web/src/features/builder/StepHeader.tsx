import { forwardRef, type ReactNode } from 'react';

type StepHeaderProps = {
  /** For the section around it to be labelled by. */
  id?: string;
  number: number;
  title: string;
  description?: ReactNode;
  /** On the right: a button. */
  actions?: ReactNode;
};

/**
 * The heading of a step. The stepper above already shows the number, so here only a screen reader says it, as
 * "2. Instruction". The builder moves focus here when the step changes, so the new step is announced.
 */
export const StepHeader = forwardRef<HTMLHeadingElement, StepHeaderProps>(function StepHeader({ id = 'builder-step', number, title, description, actions }, ref) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h2 ref={ref} id={id} tabIndex={-1} className="text-xl font-semibold tracking-tight text-text outline-none sm:text-2xl">
          <span className="sr-only">{number}. </span>
          {title}
        </h2>
        {description && <p className="mt-1.5 max-w-2xl text-md text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
});

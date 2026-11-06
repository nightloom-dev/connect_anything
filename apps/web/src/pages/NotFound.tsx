import { Blocks, LifeBuoy } from 'lucide-react';
import { Link } from 'wouter';
import { usePageTitle } from '../app/title.ts';
import { buttonClass } from '../ui/Button.tsx';

export function NotFound() {
  usePageTitle('Not found');
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-12 text-center sm:py-20">
      <p aria-hidden className="text-brand text-[4.5rem] leading-none font-semibold tracking-tighter nums sm:text-[6rem]">
        404
      </p>
      <div role="alert" className="mt-6">
        <h1 className="text-xl font-semibold text-text">There is no such page.</h1>
        <p className="mt-2 text-balance text-muted">
          The link may be cut short or mistyped. <Link href="/" className="link">Start here</Link>, or go straight to a task.
        </p>
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/kamino" className={buttonClass({ variant: 'primary' })}>
          <LifeBuoy className="size-4" aria-hidden />
          Rescue Kamino
        </Link>
        <Link href="/build" className={buttonClass({ variant: 'secondary' })}>
          <Blocks className="size-4" aria-hidden />
          Build a recipe
        </Link>
      </div>
    </div>
  );
}

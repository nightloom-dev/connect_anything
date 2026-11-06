import type { CSSProperties } from 'react';
import { cn } from './cn.ts';

type SkeletonProps = {
  /** Size it with classes (h-4 w-40) or with width and height. Give it the height of what it stands for, so nothing jumps. */
  className?: string;
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  /** Lines of text, the last one shorter. */
  lines?: number;
};

/** A placeholder, hidden from screen readers: mark the region it fills with aria-busy instead. */
export function Skeleton({ className, width, height, lines }: SkeletonProps) {
  if (lines && lines > 1) {
    return (
      <span data-ui="skeleton" aria-hidden className={cn('flex w-full flex-col gap-2', className)}>
        {Array.from({ length: lines }, (_, index) => (
          <span key={index} className="skeleton block h-3.5 rounded-sm" style={{ width: index === lines - 1 ? '62%' : '100%' }} />
        ))}
      </span>
    );
  }
  // a height or a radius in className replaces the default one: Tailwind puts h-3, size-7, rounded-full and rounded-lg
  // before h-4 and rounded-md, so with both the default would win
  const sized = height !== undefined || /(^|\s)(h|size)-/.test(className ?? '');
  const rounded = /(^|\s)rounded(-|\s|$)/.test(className ?? '');
  return <span data-ui="skeleton" aria-hidden className={cn('skeleton block', !sized && 'h-4', !rounded && 'rounded-md', className)} style={{ width, height }} />;
}

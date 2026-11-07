import { cn } from '../ui/cn.ts';

export const REPO_URL = 'https://github.com/nightloom-dev/connect_anything';
export const DOCS_URL = `${REPO_URL}#readme`;
/** How to run the Telegram watcher, which the landing page and the footer link to. */
export const WATCHER_URL = `${REPO_URL}#telegram-watcher`;
/** How to run the app and its server from a clone. */
export const SELF_HOST_URL = `${REPO_URL}#run-from-zero`;
export const ISSUES_URL = `${REPO_URL}/issues`;

/**
 * The mark, "Slot": the corner marks of a drawing field around a filled block, a slot that takes any program. On a
 * 32 grid: corners 4 thick with arms of 10, in ink, and a cobalt block of 12. public/favicon.svg is the same drawing,
 * and the PNGs beside it are drawn from it.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <path d="M4 14V4h10M28 18v10H18" strokeWidth="4" className="stroke-text" />
      <rect x="10" y="10" width="12" height="12" className="fill-accent" />
    </svg>
  );
}

/**
 * The name with the device built in: "Anything" stands in the corner marks of the mark, in cobalt. IBM Plex Sans 600
 * at 28 on a 240 × 42 box, sized by its height: at 42 it is drawn 1:1, with its strokes on whole pixels. The link
 * preview (OgImage) carries it; the header keeps the mark beside the name in words.
 */
export function Wordmark({ height = 42, className }: { height?: number; className?: string }) {
  return (
    <svg viewBox="0 0 240 42" width={(height * 240) / 42} height={height} role="img" aria-label="Connect Anything" className={cn('overflow-visible', className)}>
      <g className="fill-text font-sans text-[28px] font-semibold tracking-[-0.02em]">
        <text y="28">Connect</text>
        <text x="120.2" y="28">Anything</text>
      </g>
      <path d="M114.5 16V2.5H128M237.5 26v13.5H224" fill="none" strokeWidth="3" className="stroke-accent" />
    </svg>
  );
}

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

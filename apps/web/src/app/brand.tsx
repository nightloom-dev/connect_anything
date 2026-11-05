import { useId } from 'react';

export const REPO_URL = 'https://github.com/nightloom-dev/connect_anything';
export const DOCS_URL = `${REPO_URL}#readme`;

/** Two chains and the path between them, in the identity gradient. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  const id = `mark${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <defs>
        <linearGradient id={id} x1="2" y1="30" x2="30" y2="2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6E7BFF" />
          <stop offset="1" stopColor="#3DD6D0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id})`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" stroke="#fff" strokeOpacity="0.18" />
      <path d="M10 21.5c0-5.5 12-5.5 12-11" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="10" cy="22" r="3.4" fill="#fff" />
      <circle cx="22" cy="10" r="3.2" fill="#262c6e" stroke="#fff" strokeWidth="2.2" />
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

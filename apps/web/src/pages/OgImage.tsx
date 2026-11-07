import { createPortal } from 'react-dom';
import { Wordmark } from '../app/brand.tsx';
import { usePageTitle } from '../app/title.ts';
import { FlowScheme } from './landing/FlowScheme.tsx';

// /dev/og, development only: the picture a link to the site unfurls into, 1200 × 630, drawn as the first sheet of the
// landing page: the headline over the route of a run, on the drawing grid. To render it again into public/og.png,
// with the dev server on 5180:
//
//   cd apps/web && node -e "require('playwright').chromium.launch().then(async b => { const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
//     await p.goto('http://localhost:5180/dev/og'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(500);
//     await p.screenshot({ path: 'public/og.png' }); await b.close(); })"

export default function OgImage() {
  usePageTitle('OG image');
  return createPortal(
    <div className="bg-grid fixed top-0 left-0 z-100 flex h-[630px] w-[1200px] flex-col overflow-hidden px-[72px] pt-12 pb-10 font-sans text-text">
      <div className="flex items-center gap-5">
        <Wordmark className="shrink-0" />
        <span aria-hidden className="h-px flex-1 bg-text" />
        <span className="label-caps text-[13px]! text-muted">Built on Aurora Intents Connect</span>
      </div>
      <h1 className="mt-9 text-[54px] leading-[1.06] font-semibold tracking-[-0.03em]">
        Any Solana program.
        <br />
        One signature from any EVM chain.
      </h1>
      <div className="mt-auto">
        <FlowScheme still callouts={false} className="block w-[1056px]" />
      </div>
    </div>,
    document.body,
  );
}

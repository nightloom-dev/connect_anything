import { createPortal } from 'react-dom';
import { LogoMark } from '../app/brand.tsx';
import { usePageTitle } from '../app/title.ts';
import { FlowScheme } from './landing/FlowScheme.tsx';
import { SOURCE_CHAINS } from './landing/facts.ts';

// /dev/og, development only: the picture a link to the site unfurls into, 1200 × 630, drawn from the brand and the
// copy of the landing page. To render it again into public/og.png, with the dev server on 5180:
//
//   cd apps/web && node -e "require('playwright').chromium.launch().then(async b => { const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
//     await p.goto('http://localhost:5180/dev/og'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(500);
//     await p.screenshot({ path: 'public/og.png' }); await b.close(); })"

export default function OgImage() {
  usePageTitle('OG image');
  return createPortal(
    <div className="fixed top-0 left-0 z-100 flex h-[630px] w-[1200px] overflow-hidden bg-bg font-sans text-text">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60rem_26rem_at_30%_-8rem,color-mix(in_oklab,var(--color-accent)_22%,transparent),transparent_70%)]" />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.06)_1px,transparent_1.5px)] bg-size-[22px_22px] mask-[linear-gradient(90deg,transparent,black_55%)]"
      />
      <div className="relative flex w-[660px] shrink-0 flex-col justify-between py-16 pl-20">
        <div className="flex items-center gap-3.5">
          <LogoMark size={44} />
          <span className="text-[26px] font-semibold tracking-tight">Connect Anything</span>
        </div>
        <div>
          <h2 className="text-[54px] leading-[1.08] font-semibold tracking-[-0.03em]">
            Any Solana program. <span className="text-brand">One signature from any EVM chain.</span>
          </h2>
          <p className="mt-6 text-[22px] leading-snug text-muted">Built on Aurora Intents Connect</p>
        </div>
        <ul className="flex items-center gap-6 text-[20px] font-medium">
          {SOURCE_CHAINS.map(({ id, name, icon }) => (
            <li key={id} className="flex items-center gap-2.5">
              <img src={icon} alt="" width={28} height={28} />
              {name}
            </li>
          ))}
          <li className="text-muted" aria-hidden>
            →
          </li>
          <li className="flex items-center gap-2.5">
            <img src="/icons/solana.svg" alt="" width={28} height={28} />
            Solana
          </li>
        </ul>
      </div>
      <div className="relative flex flex-1 items-center justify-center pr-16">
        <FlowScheme still className="w-[440px]" />
      </div>
    </div>,
    document.body,
  );
}

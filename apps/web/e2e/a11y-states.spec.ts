import { audit } from './axe.ts';
import { expectOutline } from './headings.ts';
import { settle } from './look.ts';
import { SCENES } from './scenes.ts';
import { test } from './support.ts';

// axe on every scene of scenes.ts: the states a page reaches after the first screen, as a person reaches them (a
// recipe simulated, a quote, a run that went through or failed). a11y.spec.ts has the pages as they open, and
// gallery.spec.ts every section of /dev/states, the run card's 27 states among them. Each scene's heading outline too:
// one h1 and no level skipped (headings.ts), which axe reports only as a moderate finding.

/** /kamino's headings move to this outline in a branch of their own: its scenes join the check once both are merged. */
const OUTLINE_LATER = (name: string) => name.startsWith('kamino-');

for (const scene of SCENES) {
  test(`axe: ${scene.title}`, async ({ page, api, connect, wallet }, testInfo) => {
    await scene.open({ page, api, connect, wallet });
    await settle(page);
    await audit(page, testInfo, { idle: false });
    if (!OUTLINE_LATER(scene.name)) await expectOutline(page);
  });
}

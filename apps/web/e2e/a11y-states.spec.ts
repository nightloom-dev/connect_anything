import { audit } from './axe.ts';
import { settle } from './look.ts';
import { SCENES } from './scenes.ts';
import { test } from './support.ts';

// axe on every scene of scenes.ts: the states a page reaches after the first screen, as a person reaches them (a
// recipe simulated, a quote, a run that went through or failed). a11y.spec.ts has the pages as they open, and
// gallery.spec.ts every section of /dev/states, the run card's 27 states among them.

for (const scene of SCENES) {
  test(`axe: ${scene.title}`, async ({ page, api, connect, wallet }, testInfo) => {
    await scene.open({ page, api, connect, wallet });
    await settle(page);
    await audit(page, testInfo, { idle: false });
  });
}

import { freeze, pinOrigin, settle } from './look.ts';
import { SCENES } from './scenes.ts';
import { expect, test } from './support.ts';

// Every scene of scenes.ts as a whole-page screenshot, on the production build: at 1440 px (visual-desktop), 390 px
// (visual-mobile) and, for the scenes marked tablet, 820 px (visual-tablet). The baselines are
// __screenshots__/<project>/pages.visual.ts/<scene>.png; README.md says how to update them, and when.

for (const scene of SCENES) {
  test(scene.title, { tag: scene.tablet ? '@tablet' : [] }, async ({ page, api, connect, wallet }) => {
    await freeze(page, connect);
    await scene.open({ page, api, connect, wallet });
    await settle(page);
    // the scene may end scrolled down to its last click, and a whole-page picture draws the sticky header where the
    // window was
    await page.evaluate(() => window.scrollTo(0, 0));
    await pinOrigin(page);
    await expect(page).toHaveScreenshot(`${scene.name}.png`, { fullPage: true });
  });
}

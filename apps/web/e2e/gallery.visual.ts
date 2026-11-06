import { GROUPS, openGroup, section } from './gallery.ts';
import { pinOrigin } from './look.ts';
import { DEV_URL } from './servers.ts';
import { expect, test } from './support.ts';

// Every section of the gallery as a screenshot of its own, at 1440 px (visual-desktop) and 390 px (visual-mobile): one
// test per group, one baseline per section, __screenshots__/<project>/gallery.visual.ts/<section id>.png. A section
// that differs fails its group and the others are still compared.

// the gallery exists only on the dev server
test.use({ baseURL: DEV_URL });

for (const { prefix, title } of GROUPS) {
  test(`the gallery: ${title}`, async ({ page, connect }) => {
    // one screenshot per section, up to 31 in a group, each taken twice until two agree
    test.slow();
    const ids = await openGroup(page, connect, prefix);
    // A section taller than the window is drawn in pieces, many seconds each: the window grows to the tallest section
    // instead, which changes nothing in a section but where it sits.
    const tallest = await page.locator('main section[id]').evaluateAll(sections => Math.max(...sections.map(one => one.getBoundingClientRect().height)));
    const { width, height } = page.viewportSize()!;
    await page.setViewportSize({ width, height: Math.max(height, Math.ceil(tallest) + 100) });
    // the header stays at the top of the window as the page scrolls to each section, over the section's top
    await page.getByRole('banner').evaluate(header => header.style.setProperty('position', 'static'));
    await pinOrigin(page);
    for (const id of ids) await expect.soft(section(page, id), id).toHaveScreenshot(`${id}.png`);
  });
}

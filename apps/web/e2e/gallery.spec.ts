import { audit } from './axe.ts';
import { GALLERY, GROUPS, galleryShown, openGroup, sectionIds } from './gallery.ts';
import { expect, test } from './support.ts';

// The gallery, /dev/states, on the dev server (the dev project): every component and every state of the run card on
// fake data. axe checks each section on its own, so that a violation names its section, and React's development build
// prints its warnings, which support.ts turns into failures as for any page.

/** Sections with a known serious violation, each in a test of its own until it is fixed. */
const KNOWN: Record<string, string> = {
  'kamino-fork': 'QA-08: while the fork check runs again, its last figures stay at 50% opacity, under 4.5:1 (axe color-contrast, serious)',
};

test('every section of the gallery is in a group the specs walk', async ({ page }) => {
  await page.goto(GALLERY);
  await galleryShown(page);
  const ids = await sectionIds(page);
  expect(ids.length).toBeGreaterThan(50);
  expect(ids.filter(id => !GROUPS.some(({ prefix }) => id.startsWith(prefix))), 'sections in no group of gallery.ts').toEqual([]);
});

/** Groups audited in several tests, every nth section in each: the run card's 31 sections take 40 to 50 s in one. */
const PARTS: Record<string, number> = { 'run-': 2 };

for (const { prefix, title } of GROUPS) {
  const parts = PARTS[prefix] ?? 1;
  for (let part = 0; part < parts; part++) {
    test(`axe on every section of the gallery: ${title}${parts > 1 ? `, ${part + 1} of ${parts}` : ''}`, async ({ page, connect }, testInfo) => {
      // one axe run per section, up to 16 in a test
      test.slow();
      const ids = (await openGroup(page, connect, prefix)).filter((_, index) => index % parts === part);
      for (const id of ids.filter(id => !(id in KNOWN))) await audit(page, testInfo, { idle: false, include: `section[id="${id}"]`, name: id });
    });
  }
}

for (const [id, bug] of Object.entries(KNOWN)) {
  test(`axe on the gallery section ${id}`, async ({ page, connect }, testInfo) => {
    test.fixme(true, bug);
    await openGroup(page, connect, id);
    await audit(page, testInfo, { idle: false, include: `section[id="${id}"]`, name: id });
  });
}

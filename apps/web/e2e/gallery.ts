import { expect, type Page } from '@playwright/test';
import { freeze, settle } from './look.ts';
import type { FakeConnect } from './mocks/connect.ts';

// /dev/states, the gallery of every component and screen state on fake data, as the specs walk it: one group of
// sections at a time, by the prefix of their ids. The dev server serves it, and only the dev server.

export const GALLERY = '/dev/states';

/** Every section of the gallery is in exactly one group: gallery.spec.ts fails on a section none takes. */
export const GROUPS = [
  { prefix: 'ui-', title: 'the components' },
  { prefix: 'builder-', title: 'the builder' },
  { prefix: 'kamino-', title: 'the Kamino rescue' },
  { prefix: 'run-', title: 'the run card and the shared page' },
];

/**
 * Waits for the gallery's heading. Each test's fresh browser fetches the gallery's hundreds of modules from the dev
 * server, a few seconds of CPU, and many more while other suites share the machine: so longer than the usual wait.
 */
export const galleryShown = (page: Page) => expect(page.getByRole('heading', { name: 'States', exact: true })).toBeVisible({ timeout: 30_000 });

/** Opens the gallery on one group, its clock stopped, everything loaded, and returns the ids of its sections. */
export async function openGroup(page: Page, connect: FakeConnect, prefix: string) {
  await freeze(page, connect);
  await page.goto(`${GALLERY}?only=${prefix}`);
  await galleryShown(page);
  await settle(page);
  const ids = await sectionIds(page);
  expect(ids.length, `sections of ${prefix}`).toBeGreaterThan(0);
  return ids;
}

/** The ids of the sections the gallery shows. */
export const sectionIds = (page: Page) => page.locator('main section[id][aria-labelledby$="-title"]').evaluateAll(sections => sections.map(section => section.id));

/** One section, by its id. */
export const section = (page: Page, id: string) => page.locator(`section[id="${id}"]`);

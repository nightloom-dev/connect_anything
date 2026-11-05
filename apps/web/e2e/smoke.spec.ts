import type { Page } from '@playwright/test';
import { BUILDER, KAMINO, NOT_FOUND, shared } from './paths.ts';
import { RECIPES } from './mocks/api.ts';
import { expect, test } from './support.ts';

// Every page renders, and says nothing in the console while it does. A message the old UI is known to log goes in
// ALLOWED with the reason; anything else fails here.

const ALLOWED: RegExp[] = [];

const pages = [
  { name: 'the builder', path: BUILDER, ready: (page: Page) => page.getByRole('heading', { name: '1. Program' }) },
  { name: 'the Kamino rescue', path: KAMINO, ready: (page: Page) => page.getByRole('heading', { name: 'Repay a Kamino debt' }) },
  { name: 'a shared recipe', path: shared(RECIPES.demo), ready: (page: Page) => page.getByRole('heading', { name: 'A recipe someone shared with you' }) },
  { name: 'a page that does not exist', path: NOT_FOUND, ready: (page: Page) => page.getByRole('alert').filter({ hasText: 'There is no such page.' }) },
];

for (const { name, path, ready } of pages) {
  test(`${name} renders without errors`, { tag: '@mobile' }, async ({ page, problems }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Connect Anything' })).toBeVisible();
    await expect(ready(page)).toBeVisible();
    // what loads after the first paint: the token list, the recipe, AppKit
    await page.waitForLoadState('networkidle');
    expect(problems.filter(problem => !ALLOWED.some(allowed => allowed.test(problem)))).toEqual([]);
  });
}

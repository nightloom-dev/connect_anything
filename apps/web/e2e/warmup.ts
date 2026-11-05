import { chromium, type FullConfig } from '@playwright/test';
import { BUILDER, KAMINO, LANDING, NOT_FOUND, shared } from './paths.ts';

// A cold dev server spends its first page loads optimizing dependencies and transforming every module, 20 to 30 s of
// CPU, and the tests that happen to run first time out on that. This opens every page once before any test starts, so
// that each test meets a warm server. Nothing leaves the machine: /api answers 404 and anything not local is aborted.

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;

export default async function warmup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => {
      const url = route.request().url();
      if (!LOCAL.test(url)) return route.abort('blockedbyclient');
      if (new URL(url).pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: { error: 'warm-up' } });
      return route.continue();
    });
    for (const path of [LANDING, BUILDER, KAMINO, shared('warm-up'), NOT_FOUND]) {
      await page.goto(new URL(path, baseURL).href, { waitUntil: 'load', timeout: 120_000 });
      // the page's lazy chunks and the wallet code load after the first paint, and a dependency found late reloads it
      await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
    }
  } finally {
    await browser.close();
  }
}

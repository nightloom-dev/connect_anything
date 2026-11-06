// Playwright's parts must agree, or every e2e test fails at its first line with "Executable doesn't exist":
// @playwright/test (the runner), playwright-core (pinned by the overrides of the root package.json) and the Chromium
// build that playwright-core drives, in PLAYWRIGHT_BROWSERS_PATH (/opt/pw-browsers on the team's cloud machines) or
// in Playwright's cache (CI, after npx playwright install).
//
//   node scripts/check-playwright.ts      (npm run e2e:check)

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const version = (name: string) => (require(`${name}/package.json`) as { version: string }).version;
const root = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { overrides?: Record<string, string> };

const pinned = root.overrides?.['playwright-core'];
const versions = { '@playwright/test': version('@playwright/test'), playwright: version('playwright'), 'playwright-core': version('playwright-core') };
const problems: string[] = [];
if (!pinned) problems.push('the root package.json no longer pins playwright-core in its overrides');
for (const [name, installed] of Object.entries(versions)) {
  if (pinned && installed !== pinned) problems.push(`${name} is ${installed}, the root package.json pins playwright-core ${pinned}`);
}

// the Chromium build of this playwright-core, and whether this machine has it
const core = dirname(require.resolve('playwright-core/package.json'));
const browsers = JSON.parse(readFileSync(join(core, 'browsers.json'), 'utf8')) as { browsers: { name: string; revision: string; browserVersion?: string }[] };
const where = process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0' ? process.env.PLAYWRIGHT_BROWSERS_PATH : join(homedir(), '.cache', 'ms-playwright');
for (const name of ['chromium', 'chromium-headless-shell']) {
  const browser = browsers.browsers.find(entry => entry.name === name);
  if (!browser) continue;
  const folder = join(where, `${name.replaceAll('-', '_')}-${browser.revision}`);
  const found = existsSync(folder);
  console.log(`${name} ${browser.browserVersion ?? ''} (build ${browser.revision}): ${found ? folder : `not in ${where}`}`);
  if (!found) problems.push(`${folder} is missing: in CI, npx playwright install --with-deps chromium; on a machine whose browsers are given (PLAYWRIGHT_BROWSERS_PATH), pin Playwright to their version`);
}

console.log(Object.entries(versions).map(([name, installed]) => `${name} ${installed}`).join(', '), `(pinned ${pinned ?? 'nowhere'})`);
if (problems.length) {
  console.error(`\n${problems.join('\n')}`);
  process.exit(1);
}

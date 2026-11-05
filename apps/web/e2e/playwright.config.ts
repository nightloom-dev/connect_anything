import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// Chromium comes from PLAYWRIGHT_BROWSERS_PATH (/opt/pw-browsers here), which has to match @playwright/test 1.63.0.
// E2E_PORT lets several checkouts run the suite at once, each against its own dev server
const PORT = Number(process.env.E2E_PORT ?? 5182);

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  outputDir: '.results',
  // opens every page once on the fresh dev server, so that the first tests do not pay for its cold start
  globalSetup: './warmup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 30_000,
  // a page of the dev server takes a few seconds of CPU to start, more with every worker busy
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: { mode: 'retain-on-failure', snapshots: false },
    screenshot: 'only-on-failure',
    // the page's words, as the tests read them
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    // Each test loads the dev page afresh, seconds of CPU, so the phone runs what differs there: every page, the AppKit
    // modal, the Kamino deep link of the watcher, a quote and a run. Tag a test '@mobile' to add it.
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
    // The in-app browser of Telegram on iOS is WebKit. Off until /opt/pw-browsers has a WebKit for 1.63.0.
    // { name: 'mobile-webkit', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    // a fake key: every /api and Connect request of the page is mocked, so the dev server only serves the page
    command: `AURORA_KEY=test npx vite --port ${PORT} --strictPort`,
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

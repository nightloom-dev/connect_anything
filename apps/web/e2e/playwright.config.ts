import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { BUILD_DIR, DEV_PORT, DEV_URL, PAGES_URL, PREVIEW_PORT, PREVIEW_URL } from './servers.ts';

// Chromium comes from PLAYWRIGHT_BROWSERS_PATH, or Playwright's cache, and has to match @playwright/test 1.63.0.
// Which test runs where, and why, is in README.md: "Projects, servers and time".

const CI = !!process.env.CI;
const ON_DEV = PAGES_URL === DEV_URL;
// E2E_REUSE=1 takes servers that already listen on the ports, as they are: a preview server then serves whatever it
// was built from, so rebuild it yourself
const REUSE = process.env.E2E_REUSE === '1';
const web = fileURLToPath(new URL('..', import.meta.url));

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };
// Screenshots: one pixel per CSS pixel, and nothing that moves. The app turns its animations off for reduced motion,
// and toHaveScreenshot stops what is left.
const still = { deviceScaleFactor: 1, reducedMotion: 'reduce' as const };
const tablet = { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 } };
const phone = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 } };

/** Specs that need the dev server: the gallery is only there. */
const DEV_ONLY = /gallery\.spec\.ts$/;

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  outputDir: '.results',
  // e2e/__screenshots__/<project>/<spec>/<name>.png: one folder per width
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFileName}/{arg}{ext}',
  // a baseline changes only with npm run e2e:update and a person looking at the diff, never by itself in CI
  updateSnapshots: CI ? 'none' : 'missing',
  fullyParallel: true,
  forbidOnly: CI,
  // on CI one retry, as the wallet modal now and then opens its WalletConnect view on a slow runner; the report marks
  // a test that passed on the retry as flaky
  retries: CI ? 1 : 0,
  workers: CI ? 2 : 4,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // the same run on the same machine draws the same pixels, so locally any difference counts; on another machine
      // (CI) fonts rasterize a little differently, which E2E_PIXEL_TOLERANCE lets through
      maxDiffPixelRatio: Number(process.env.E2E_PIXEL_TOLERANCE ?? 0),
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      stylePath: fileURLToPath(new URL('./visual.css', import.meta.url)),
    },
  },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }], ...(CI ? [['github'] as ['github']] : [])],
  use: {
    baseURL: PAGES_URL,
    // DOM snapshots store every script the page loads, 56 MB on the dev server; the screencast, console and network
    // are enough to read a failure
    trace: { mode: 'retain-on-failure', snapshots: false },
    screenshot: 'only-on-failure',
    // the page's words, as the tests read them
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  projects: [
    // Opens every page and the gallery on the fresh dev server, so that the first tests there do not pay for its cold
    // start: 20 to 30 s of CPU. Only the projects that use the dev server wait for it.
    { name: 'warm-dev', testMatch: 'warm-dev.setup.ts', use: { baseURL: DEV_URL } },

    // Behaviour, on the production build.
    { name: 'desktop', testIgnore: DEV_ONLY, use: desktop, dependencies: ON_DEV ? ['warm-dev'] : [] },
    // The phone runs what differs there: every page, the AppKit modal, the Kamino deep link of the watcher, a quote and
    // a run. Tag a test '@mobile' to add it.
    { name: 'mobile', testIgnore: DEV_ONLY, grep: /@mobile/, use: devices['Pixel 7'], dependencies: ON_DEV ? ['warm-dev'] : [] },
    // The in-app browser of Telegram on iOS is WebKit. Off until the WebKit build for 1.63.0 is installed where tests run.
    // { name: 'mobile-webkit', use: { ...devices['iPhone 14'] } },

    // The dev server: every section of the gallery (axe, console), and every page once more, for the warnings only
    // React's development build prints.
    { name: 'dev', testMatch: ['gallery.spec.ts', 'smoke.spec.ts'], use: { ...desktop, baseURL: DEV_URL }, dependencies: ['warm-dev'] },

    // Screenshots, at 1440, 820 and 390 px: npm run e2e:visual. Pages come from the production build, the gallery from
    // the dev server. The tablet width takes the scenes tagged '@tablet'.
    { name: 'visual-desktop', testMatch: '*.visual.ts', use: { ...desktop, ...still }, dependencies: ['warm-dev'] },
    { name: 'visual-tablet', testMatch: 'pages.visual.ts', grep: /@tablet/, use: { ...tablet, ...still }, dependencies: ON_DEV ? ['warm-dev'] : [] },
    { name: 'visual-mobile', testMatch: '*.visual.ts', use: { ...phone, ...still }, dependencies: ['warm-dev'] },
  ],
  webServer: [
    {
      // a fake key: every /api and Connect request of the page is mocked, so the dev server only serves the page
      command: `AURORA_KEY=test npx vite --port ${DEV_PORT} --strictPort`,
      cwd: web,
      url: DEV_URL,
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    ...(ON_DEV
      ? []
      : [
          {
            // built for every run, so that it is never the build of yesterday's code; vite preview needs a key as the dev
            // server does, and serves no /api the tests reach
            command: `npx vite build --outDir ${BUILD_DIR} --emptyOutDir --logLevel warn && AURORA_KEY=test npx vite preview --outDir ${BUILD_DIR} --port ${PREVIEW_PORT} --strictPort`,
            cwd: web,
            url: PREVIEW_URL,
            reuseExistingServer: REUSE,
            timeout: 240_000,
          },
        ]),
  ],
});

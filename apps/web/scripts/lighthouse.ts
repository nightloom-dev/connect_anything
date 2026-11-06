// Lighthouse on the production build: vite preview serves dist, and Lighthouse drives
// Playwright's Chromium (the whole browser, not the headless shell the tests use) over each page, at desktop and at
// mobile.
//
//   npm run build && npm run lighthouse        (PORT=5384 serves the build elsewhere than on 4174; LIGHTHOUSE_CHROME
//                                               names another Chrome)
//
// The reports go to e2e/lighthouse/<page>-<form factor>.report.html and .json. The spec's thresholds: Accessibility
// and Best Practices at least 95 on every page, Performance at least 80 on / at desktop. The other scores are printed
// for the record. Exits 1 when a threshold is missed.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

/** Pinned, as npx would otherwise take whatever was published last. */
const LIGHTHOUSE = 'lighthouse@13.5.0';
const PAGES = [
  { name: 'landing', path: '/' },
  { name: 'kamino', path: '/kamino' },
  { name: 'build', path: '/build' },
];
const FORMS = ['desktop', 'mobile'] as const;

type Form = (typeof FORMS)[number];
type Category = 'performance' | 'accessibility' | 'best-practices' | 'seo';
const THRESHOLDS: { category: Category; min: number; applies: (page: string, form: Form) => boolean }[] = [
  { category: 'accessibility', min: 95, applies: () => true },
  { category: 'best-practices', min: 95, applies: () => true },
  { category: 'performance', min: 80, applies: (page, form) => page === '/' && form === 'desktop' },
];

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(web, 'e2e', 'lighthouse');
const port = Number(process.env.PORT ?? 4174);
const origin = `http://localhost:${port}`;
// the binary itself: CHROME_PATH may name a wrapper script (it does on the team's cloud machines)
const chrome = process.env.LIGHTHOUSE_CHROME ?? chromium.executablePath();

// vite preview, in a process group of its own so that npx and vite stop together
const preview = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
  cwd: web,
  detached: true,
  stdio: 'ignore',
  // the server routes want a key to start; the pages Lighthouse opens call none of them
  env: { ...process.env, AURORA_KEY: process.env.AURORA_KEY ?? 'test' },
});
// the script ends when Lighthouse is done, not when the server is
preview.unref();
const stop = () => {
  try {
    process.kill(-preview.pid!, 'SIGTERM');
  } catch {
    // gone already
  }
};
process.on('exit', stop);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => process.exit(130));

async function ready() {
  for (const until = Date.now() + 30_000; Date.now() < until; await new Promise(done => setTimeout(done, 300))) {
    try {
      if ((await fetch(origin)).ok) return;
    } catch {
      // not yet
    }
  }
  throw new Error(`vite preview did not answer on ${origin} in 30 s: is dist built, and is the port free?`);
}

type Row = { page: string; form: Form; scores: Record<string, number>; metrics: Record<string, string>; report: string };

await ready();
mkdirSync(out, { recursive: true });
const rows: Row[] = [];
for (const { name, path } of PAGES) {
  for (const form of FORMS) {
    const base = join(out, `${name}-${form}`);
    const run = spawnSync(
      'npx',
      ['-y', LIGHTHOUSE, `${origin}${path}`, ...(form === 'desktop' ? ['--preset=desktop'] : []), '--chrome-flags=--headless=new --no-sandbox', '--output=json', '--output=html', `--output-path=${base}`, '--quiet'],
      { stdio: 'inherit', env: { ...process.env, CHROME_PATH: chrome } },
    );
    if (run.status !== 0) throw new Error(`Lighthouse failed on ${path} (${form})`);
    const report = JSON.parse(readFileSync(`${base}.report.json`, 'utf8'));
    rows.push({
      page: path,
      form,
      scores: Object.fromEntries(Object.entries(report.categories as Record<string, { score: number | null }>).map(([id, { score }]) => [id, Math.round((score ?? 0) * 100)])),
      metrics: Object.fromEntries(['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift'].map(id => [id, report.audits[id]?.displayValue ?? '?'])),
      report: `${base}.report.html`,
    });
  }
}

const header = ['page', 'form', 'Perf', 'A11y', 'BP', 'SEO', 'FCP', 'LCP', 'TBT', 'CLS'];
const table = [
  header,
  ...rows.map(({ page, form, scores, metrics }) => [
    page,
    form,
    ...['performance', 'accessibility', 'best-practices', 'seo'].map(id => String(scores[id] ?? '?')),
    ...['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift'].map(id => metrics[id]),
  ]),
];
const widths = header.map((_, column) => Math.max(...table.map(cells => cells[column].length)));
console.log(`\n${LIGHTHOUSE}, ${chrome}\n`);
for (const cells of table) console.log(cells.map((cell, column) => cell.padEnd(widths[column])).join('  '));

const missed = rows.flatMap(({ page, form, scores }) =>
  THRESHOLDS.filter(({ category, min, applies }) => applies(page, form) && scores[category] < min).map(({ category, min }) => `${page} (${form}): ${category} ${scores[category]} < ${min}`),
);
console.log(`\nReports: ${out}`);
if (missed.length) console.error(`\nUnder the spec's thresholds:\n  ${missed.join('\n  ')}`);
else console.log("All of the spec's thresholds are met.");
process.exit(missed.length ? 1 : 0);

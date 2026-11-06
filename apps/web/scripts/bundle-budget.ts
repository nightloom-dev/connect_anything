// What a first visit to / downloads before the page can run, measured on a production build, against two budgets.
//
//   node scripts/bundle-budget.ts [dist]      (npm run budget, after npm run build)
//
// Counted: index.html, the stylesheets and module scripts it links (the entry, its modulepreloads) and every module
// those import statically, each gzipped as Vite reports it (zlib's default level, 1 kB = 1000 bytes). Not counted:
// what the page loads later through import() (the wallet code, every page but the landing one) and the fonts it
// preloads (woff2, compressed already); both are listed for the record.
//
// Fails when the total is over either budget:
// - SPEC: 560 kB, 40% under the 927 kB of the old single chunk;
// - REGRESSION: what the build measured on 2026-11-06 (127.2 kB), plus room for the work of the last days. It is here
//   to catch a heavy import that lands in the entry by mistake. Raise it on purpose, in a commit that says why.

import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { gzipSync } from 'node:zlib';

const SPEC = 560_000;
const REGRESSION = 135_000;

const dist = process.argv[2] ?? 'dist';
if (!existsSync(join(dist, 'index.html'))) {
  console.error(`No ${join(dist, 'index.html')}: build the app first (npm run build).`);
  process.exit(2);
}

type File = { path: string; why: string; bytes: number; gzip: number };

const read = (path: string) => readFileSync(join(dist, path));
const measure = (path: string, why: string): File => {
  const body = read(path);
  return { path, why, bytes: body.length, gzip: gzipSync(body).length };
};
const kB = (bytes: number) => `${(bytes / 1000).toFixed(2)} kB`;

/** The tags of index.html that load something, with their attributes. */
const html = read('index.html').toString();
const tags = [...html.matchAll(/<(script|link)\b([^>]*)>/gi)].map(([, tag, attributes]) => ({
  tag: tag.toLowerCase(),
  attributes: Object.fromEntries(
    [...attributes.matchAll(/([\w-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g)].map(([, name, value]) => [name.toLowerCase(), value?.replace(/^["']|["']$/g, '') ?? '']),
  ),
}));

/** A URL of the page, as a path in dist; null for another origin. */
const local = (url: string) => (/^(https?:)?\/\//.test(url) ? null : url.replace(/^\//, '').replace(/[?#].*$/, ''));

const counted: File[] = [measure('index.html', 'the page')];
const notCounted: File[] = [];
const elsewhere: string[] = [];
const seen = new Set<string>(['index.html']);

const add = (url: string, why: string, into: File[]) => {
  const path = local(url);
  if (path === null) return void elsewhere.push(url);
  if (seen.has(path)) return;
  seen.add(path);
  into.push(measure(path, why));
  if (into === counted && path.endsWith('.js')) follow(path);
};

/**
 * The modules a built module imports statically: `import … from "./x.js"`, `import "./x.js"`, `export … from
 * "./x.js"`. Not import("./x.js"), which loads when the code asks for it.
 */
function follow(path: string) {
  const code = read(path).toString();
  const statics = /(?:\bimport\s*(?:[\w$*{}\s,]+?\s*from\s*)?|\bexport\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*)["'](\.{1,2}\/[^"']+|\/[^"']+)["']/g;
  for (const [, specifier] of code.matchAll(statics)) {
    const target = specifier.startsWith('/') ? specifier.slice(1) : posix.normalize(posix.join(posix.dirname(path), specifier));
    if (existsSync(join(dist, target))) add(target, `imported by ${path}`, counted);
  }
}

for (const { tag, attributes } of tags) {
  const rel = attributes.rel?.toLowerCase();
  if (tag === 'script' && attributes.src && attributes.type === 'module') add(attributes.src, 'entry', counted);
  else if (tag === 'script' && attributes.src) add(attributes.src, 'script', counted);
  else if (tag === 'link' && rel === 'modulepreload' && attributes.href) add(attributes.href, 'modulepreload', counted);
  else if (tag === 'link' && rel === 'stylesheet' && attributes.href) add(attributes.href, 'stylesheet', counted);
  else if (tag === 'link' && rel === 'preload' && attributes.href) add(attributes.href, `preload, as ${attributes.as ?? '?'}`, notCounted);
}
if (!counted.some(file => file.why === 'entry')) {
  console.error('index.html links no module script: is this a Vite build?');
  process.exit(2);
}

const later = readdirSync(join(dist, 'assets'))
  .map(name => `assets/${name}`)
  .filter(path => path.endsWith('.js') && !seen.has(path))
  .map(path => measure(path, 'import()'));
const laterGzip = later.reduce((sum, file) => sum + file.gzip, 0);

const total = counted.reduce((sum, file) => sum + file.gzip, 0);
const width = Math.max(...[...counted, ...notCounted].map(file => file.path.length));
const row = (file: File) => `  ${file.path.padEnd(width)}  ${kB(file.gzip).padStart(10)}  ${kB(file.bytes).padStart(10)}  ${file.why}`;
const verdict = (budget: number) => (total <= budget ? `ok, ${kB(budget - total)} to spare` : `OVER by ${kB(total - budget)}`);

const report = [
  `First load of / from ${dist}:`,
  `  ${'file'.padEnd(width)}  ${'gzip'.padStart(10)}  ${'raw'.padStart(10)}`,
  ...counted.map(row),
  `  ${'total'.padEnd(width)}  ${kB(total).padStart(10)}`,
  '',
  `  spec budget        ${kB(SPEC).padStart(10)}: ${verdict(SPEC)}`,
  `  regression budget  ${kB(REGRESSION).padStart(10)}: ${verdict(REGRESSION)}`,
  '',
  'Not counted:',
  ...notCounted.map(row),
  `  ${later.length} chunks loaded later through import(), ${kB(laterGzip)} gzip in all; the largest: ${later
    .sort((a, b) => b.gzip - a.gzip)
    .slice(0, 3)
    .map(file => `${file.path} ${kB(file.gzip)}`)
    .join(', ')}`,
  ...elsewhere.map(url => `  ${url} (another origin)`),
];
console.log(report.join('\n'));

// on GitHub Actions, the same table on the run's page
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    '### First load of `/` (gzip)',
    '',
    '| file | gzip | raw | why |',
    '| --- | ---: | ---: | --- |',
    ...counted.map(file => `| \`${file.path}\` | ${kB(file.gzip)} | ${kB(file.bytes)} | ${file.why} |`),
    `| **total** | **${kB(total)}** | | |`,
    '',
    `Spec budget ${kB(SPEC)}: ${verdict(SPEC)}. Regression budget ${kB(REGRESSION)}: ${verdict(REGRESSION)}.`,
    '',
  ];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
}

if (total > SPEC || total > REGRESSION) {
  console.error(
    total > SPEC
      ? `\nThe first load of / is over the budget of ${kB(SPEC)}.`
      : `\nThe first load of / grew past the regression budget of ${kB(REGRESSION)}. Find what came into the entry (npx vite-bundle-visualizer, or the build's chunk list); if it belongs there, raise REGRESSION in scripts/bundle-budget.ts and say why in the commit.`,
  );
  process.exit(1);
}

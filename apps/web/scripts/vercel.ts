// Writes .vercel/output at the root in Vercel's Build Output API v3 after `vite build`: the pages as static files, the
// server routes as one function, every other path to index.html. Deploy it with `npx vercel deploy --prebuilt --prod`.
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const out = new URL('../../../.vercel/output/', import.meta.url);
const fn = new URL('functions/api.func/', out);
await rm(out, { recursive: true, force: true });
await cp(new URL('../dist/', import.meta.url), new URL('static/', out), { recursive: true });
await mkdir(fn, { recursive: true });
await build({
  entryPoints: [new URL('../server/vercel.ts', import.meta.url).pathname],
  outfile: new URL('index.mjs', fn).pathname,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // CommonJS packages inside an ES module still call require, and some read __filename, or a wasm next to __dirname
  banner: {
    js: "import { createRequire } from 'node:module'; import { dirname as __dirnameOf } from 'node:path'; const require = createRequire(import.meta.url); const __filename = new URL(import.meta.url).pathname; const __dirname = __dirnameOf(__filename);",
  },
  logLevel: 'warning',
});
await cp(new URL('../../../node_modules/@orca-so/whirlpools-core/dist/nodejs/orca_whirlpools_core_js_bindings_bg.wasm', import.meta.url), new URL('orca_whirlpools_core_js_bindings_bg.wasm', fn));
const json = (file: URL, value: unknown) => writeFile(file, JSON.stringify(value, null, 2));
await json(new URL('.vc-config.json', fn), { runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 60 });
await json(new URL('config.json', out), {
  version: 3,
  routes: [{ src: '^/api(/.*)?$', dest: '/api' }, { handle: 'filesystem' }, { src: '^/(.*)$', dest: '/index.html' }],
});
console.log('.vercel/output is ready');

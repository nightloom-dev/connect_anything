import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { createApi } from './server/api.ts';

const api = (env: Record<string, string>): Plugin => {
  const handle = createApi(env);
  return {
    name: 'api',
    configureServer: s => void s.middlewares.use(handle),
    configurePreviewServer: s => void s.middlewares.use(handle),
  };
};

// The browser finds a font only once the CSS is parsed. IBM Plex Sans's Latin file draws every page, so it starts with the HTML.
const preloadFont = (): Plugin => {
  let base = '/';
  return {
    name: 'preload-font',
    apply: 'build',
    configResolved: config => void (base = config.base),
    transformIndexHtml: {
      order: 'post',
      handler: (_html, { bundle }) => {
        const font = Object.keys(bundle ?? {}).find(file => /\/ibm-plex-sans-latin-wght-normal-[\w-]+\.woff2$/.test(file));
        if (!font) return [];
        return [{ tag: 'link', attrs: { rel: 'preload', href: `${base}${font}`, as: 'font', type: 'font/woff2', crossorigin: '' }, injectTo: 'head' }];
      },
    },
  };
};

// Link previews, X's above all, take the picture only by an absolute URL, and the image is built before it knows its
// domain. So vite preview, which serves the site, writes the origin into the page it serves to one of ALLOWED_HOSTS.
const absoluteMeta = (env: Record<string, string>): Plugin => {
  const hosts = env.ALLOWED_HOSTS?.split(',') ?? [];
  let page: Promise<string> | undefined;
  return {
    name: 'absolute-meta',
    configurePreviewServer: server =>
      void server.middlewares.use((req, res, next) => {
        const host = req.headers.host;
        const path = req.url?.split('?')[0] ?? '';
        // a page, not a file or an API route; any other host goes on to vite's own check, and its 403
        if (!(req.method === 'GET' || req.method === 'HEAD') || /\.\w+$|^\/api\//.test(path) || !host || !hosts.includes(host.replace(/:\d+$/, ''))) return next();
        page ??= readFile(resolve(server.config.root, server.config.build.outDir, 'index.html'), 'utf8');
        const origin = `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${host}`;
        page.then(
          html => {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(html.replaceAll('content="/og.png"', `content="${origin}/og.png"`));
          },
          () => {
            // no build to serve: vite answers as it would have
            page = undefined;
            next();
          },
        );
      }),
  };
};

export default defineConfig(({ command, mode }) => {
  const env = { CONNECT_API_URL: 'https://intents-connect-api.aurora.dev', ...process.env, ...loadEnv(mode, process.cwd(), '') } as Record<string, string>;
  // a build only bundles the pages, so an image builds without the key and gets it at run time
  if (command === 'serve' && !env.AURORA_KEY) throw new Error('AURORA_KEY is not set (apps/web/.env)');
  return {
    server: { port: 5180 },
    // vite preview answers 403 to a host it does not know
    preview: { port: 4173, allowedHosts: env.ALLOWED_HOSTS?.split(',') },
    define: { 'import.meta.env.CONNECT_API_URL': JSON.stringify(env.CONNECT_API_URL) },
    // the browser picks font subsets by unicode-range and fetches only those; inlined, the CSS carried all of them
    build: { assetsInlineLimit: (file: string) => (/\.woff2?$/.test(file) ? false : undefined) },
    plugins: [api(env), absoluteMeta(env), preloadFont(), tailwindcss(), react(), nodePolyfills({ include: ['buffer', 'process', 'util', 'crypto'], globals: { Buffer: true, global: true, process: true } })],
  };
});

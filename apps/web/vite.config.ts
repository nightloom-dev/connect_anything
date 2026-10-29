import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const PREFIX = '/api/intents-connect/';

const keyProxy = (env: Record<string, string>): Plugin => {
  const handle = async (req: any, res: any, next: () => void) => {
    if (!req.url?.startsWith(PREFIX)) return next();
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c);
    const r = await fetch(env.CONNECT_API_URL + '/' + req.url.slice(PREFIX.length), {
      method: req.method,
      headers: { 'content-type': 'application/json', 'x-api-key': env.AURORA_KEY },
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    res.statusCode = r.status;
    res.setHeader('content-type', r.headers.get('content-type') ?? 'application/json');
    res.end(Buffer.from(await r.arrayBuffer()));
  };
  return {
    name: 'intents-connect-key-proxy',
    configureServer: s => void s.middlewares.use(handle),
    configurePreviewServer: s => void s.middlewares.use(handle),
  };
};

export default defineConfig(({ mode }) => {
  const env = { CONNECT_API_URL: 'https://intents-connect-api.aurora.dev', ...process.env, ...loadEnv(mode, process.cwd(), '') } as Record<string, string>;
  if (!env.AURORA_KEY) throw new Error('AURORA_KEY is not set (apps/web/.env)');
  return {
    server: { port: 5180 },
    define: { 'import.meta.env.CONNECT_API_URL': JSON.stringify(env.CONNECT_API_URL) },
    plugins: [keyProxy(env), react(), nodePolyfills({ include: ['buffer', 'process', 'util', 'crypto'], globals: { Buffer: true, global: true, process: true } })],
  };
});

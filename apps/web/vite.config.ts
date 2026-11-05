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

export default defineConfig(({ command, mode }) => {
  const env = { CONNECT_API_URL: 'https://intents-connect-api.aurora.dev', ...process.env, ...loadEnv(mode, process.cwd(), '') } as Record<string, string>;
  // a build only bundles the pages, so an image builds without the key and gets it at run time
  if (command === 'serve' && !env.AURORA_KEY) throw new Error('AURORA_KEY is not set (apps/web/.env)');
  return {
    server: { port: 5180 },
    // vite preview answers 403 to a host it does not know
    preview: { port: 4173, allowedHosts: env.ALLOWED_HOSTS?.split(',') },
    define: { 'import.meta.env.CONNECT_API_URL': JSON.stringify(env.CONNECT_API_URL) },
    plugins: [api(env), tailwindcss(), react(), nodePolyfills({ include: ['buffer', 'process', 'util', 'crypto'], globals: { Buffer: true, global: true, process: true } })],
  };
});

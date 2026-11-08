// The server routes as one Vercel function, the same ones vite's dev and preview servers mount. Its disk lives only as
// long as the instance, so a shared /r/:id link stays up until Vercel recycles the function that stored it.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApi } from './api.ts';

const handle = createApi({ CONNECT_API_URL: 'https://intents-connect-api.aurora.dev', RECIPES_DIR: '/tmp/recipes', ...process.env });

export default (req: IncomingMessage, res: ServerResponse) =>
  handle(req, res, () => {
    res.statusCode = 404;
    res.end('Not found');
  });

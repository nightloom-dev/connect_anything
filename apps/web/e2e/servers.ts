// The two servers the tests run against, for the config and for a spec that needs the other one.
//
// - The production build (vite build, then vite preview) serves the pages: a page is ready in well under a second,
//   where the dev server spends 5 to 20 s of CPU on each fresh browser.
// - The dev server is the only one with /dev/states, the gallery of every state, and the only one where React prints
//   its warnings.
//
// E2E_PORT and E2E_PREVIEW_PORT let several checkouts run the suite at once, each on its own ports.
// E2E_TARGET=dev runs the page tests on the dev server too, as before the build existed: slower, with React's warnings.

export const DEV_PORT = Number(process.env.E2E_PORT ?? 5182);
export const PREVIEW_PORT = Number(process.env.E2E_PREVIEW_PORT ?? DEV_PORT + 1);

export const DEV_URL = `http://localhost:${DEV_PORT}`;
export const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;

/** Where the page tests go: the production build, unless E2E_TARGET=dev. */
export const PAGES_URL = process.env.E2E_TARGET === 'dev' ? DEV_URL : PREVIEW_URL;

/** The production build the preview server serves, apart from `dist` so that the e2e run and `npm run build` never meet. */
export const BUILD_DIR = 'e2e/.dist';

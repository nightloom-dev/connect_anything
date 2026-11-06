// What the page may say in its console without failing the test, each with the reason. Every other error, warning or
// failed console.assert, and every uncaught exception, fails the test it happens in (support.ts). That covers React's
// warnings, which only its development build prints: the dev project runs the pages, the gallery and the keyboard
// flows on the dev server for them.
//
// An entry here is third-party noise or the echo of a failure the test provokes on purpose. Never add one for a
// message of this app's own code: fix the code, or mark the new test test.fixme.

export type ConsoleLine = { type: string; text: string; url: string };

/** The app's /api and Connect's /api/v1, on whatever host: every request there is answered by the mocks. */
const MOCKED = /^https?:\/\/[^/]+\/api\//;

const KNOWN: { why: string; matches: (line: ConsoleLine) => boolean }[] = [
  {
    // a status the test asked for: Connect's 503, the 404 of a missing recipe, the 400 of a bad address
    why: "The browser's own line for an error status of a mocked request. A request no mock answers fails the test by itself.",
    matches: ({ text, url }) => /^Failed to load resource: the server responded with a status of \d+/.test(text) && MOCKED.test(url),
  },
  {
    why: 'A request cut on purpose: by the test (route.abort, as smoke.spec.ts does to the wallet code), or by support.ts, which then fails the test itself under "requests no mock answered".',
    matches: ({ text }) => /^Failed to load resource: net::ERR_(FAILED|BLOCKED_BY_CLIENT)$/.test(text),
  },
  {
    why: 'Lit, which AppKit builds its modal on, says this once per page in a development build: the dev server only.',
    matches: ({ text }) => text.startsWith('Lit is in dev mode. Not recommended for production!'),
  },
  {
    why: "Lit again, development build only: AppKit's own router sets a property while it updates. Not this app's code.",
    matches: ({ text }) => /^Element w3m-[\w-]+ scheduled an update \(generally because a property was set\) after an update completed/.test(text),
  },
  {
    // states 12, 13 and 26 check that the deletion happens
    why: 'The SDK (7.28.0) logs this when cancel() deletes an execution after a failed step (a declined signature, a quote that moved, a 409): its runner does not move from failed to cancelled, and the deletion goes through all the same.',
    matches: ({ text }) => text === '[INTENTS-CONNECT] invalid transition requested (from failed to cancelled)',
  },
  {
    why: 'The SDK retries a poll that failed. Only a test makes Connect fail (connect.failReads), and the page shows the fifth failure in a row (state 17).',
    matches: ({ text }) => /^\[INTENTS-CONNECT\] poll for execution \S+ failed \(\d+\/\d+ consecutive\) — retrying/.test(text),
  },
  {
    why: 'After a declined signature the SDK asks to sign the deletion of the attempt, and the test declined that too: the attempt keeps the slot (state 13).',
    matches: ({ text }) => text.startsWith('[INTENTS-CONNECT] auto-cancel after a rejected signature failed'),
  },
];

/** A line the console may say: see KNOWN for each and its reason. */
export const isKnownNoise = (line: ConsoleLine) => KNOWN.some(({ matches }) => matches(line));

/** The console lines that count: errors, warnings and failed asserts. */
export const counts = (type: string) => type === 'error' || type === 'warning' || type === 'assert';

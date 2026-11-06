/**
 * The address the links of the example watcher alert start with. `configured` is VITE_PUBLIC_URL, the address the site
 * is served at, as apps/watch takes it in PUBLIC_URL: used when it is an http(s) address, without a trailing slash, a
 * query or a hash. Otherwise `fallback`, the origin the page is opened at.
 */
export function siteAddress(configured: unknown, fallback: string) {
  if (typeof configured !== 'string' || !configured.trim()) return fallback;
  try {
    const url = new URL(configured.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return fallback;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

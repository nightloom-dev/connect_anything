import { useEffect } from 'react';

const APP = 'Connect Anything';

/** The tab's title for a page, as "Rescue Kamino · Connect Anything". */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP}` : APP;
  }, [title]);
}

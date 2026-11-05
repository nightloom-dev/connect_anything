import type { ReactNode } from 'react';

/** One block of the /dev/states gallery. The id is its anchor, as /dev/states#ui-buttons, and its filter, as ?only=ui-. */
export type DevSection = {
  id: string;
  title: string;
  description?: string;
  render: () => ReactNode;
};

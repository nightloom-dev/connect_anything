import { CircleCheck, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import { Toaster as Sonner, toast } from 'sonner';
import { Spinner } from './Spinner.tsx';

export { toast };

/** One per app, in the Shell. Call toast('Link created'), toast.success(…), toast.error(…) from anywhere. */
export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      offset={20}
      mobileOffset={16}
      gap={8}
      duration={3500}
      containerAriaLabel="Notifications"
      icons={{
        success: <CircleCheck className="size-4 text-success" aria-hidden />,
        error: <OctagonAlert className="size-4 text-danger" aria-hidden />,
        warning: <TriangleAlert className="size-4 text-warning" aria-hidden />,
        info: <Info className="size-4 text-info" aria-hidden />,
        loading: <Spinner size="sm" className="text-muted" />,
      }}
    />
  );
}

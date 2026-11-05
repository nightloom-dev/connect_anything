import type { FocusEventHandler } from 'react';
import { Wallet } from 'lucide-react';
import { Button } from '../ui/Button.tsx';

/** "Connect wallet", or "Connect" on a narrow phone, with the rest kept for screen readers. One span, so the button's
 * gap does not open between the two words. */
export function ConnectLabel() {
  return (
    <span>
      Connect<span className="max-[25rem]:sr-only"> wallet</span>
    </span>
  );
}

/** "Connecting…", or "Connect" beside the spinner on a narrow phone, so the button keeps its width and the header still
 * fits 360 px. A screen reader hears "Connecting…" at any width. */
export function ConnectingLabel() {
  return (
    <span>
      <span className="max-[25rem]:sr-only">Connecting…</span>
      <span aria-hidden className="hidden max-[25rem]:inline">
        Connect
      </span>
    </span>
  );
}

type WalletPlaceholderProps = {
  /** The wallet code is on its way because of a click: the button spins until the real one takes over. */
  pending: boolean;
  /** Pointing at it or focusing it starts loading the wallet code, so a click finds it closer to ready. */
  onIntent: () => void;
  onConnect: () => void;
  onFocus?: FocusEventHandler;
  onBlur?: FocusEventHandler;
};

/**
 * The header's wallet button while the wallet code loads: it looks like the real one and costs nothing. A click
 * connects in one go: the real button opens AppKit's modal as soon as AppKit is up.
 */
export function WalletPlaceholder({ pending, onIntent, onConnect, onFocus, onBlur }: WalletPlaceholderProps) {
  return (
    <Button
      variant="soft"
      size="sm"
      icon={<Wallet />}
      loading={pending}
      data-wallet="loading"
      onPointerEnter={onIntent}
      onFocus={event => {
        onIntent();
        onFocus?.(event);
      }}
      onBlur={onBlur}
      onClick={onConnect}
    >
      <ConnectLabel />
    </Button>
  );
}

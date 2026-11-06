import { useContext, useEffect, useId, useState } from 'react';
import { ArrowUpRight, ChevronDown, Copy, LogOut, Wallet } from 'lucide-react';
import type { Intermediary } from '@aurora-is-near/intents-connect';
import { useIntentsConnect } from '@aurora-is-near/intents-connect/react';
import { AppKitContext, useIntentsConnectWallet } from '@aurora-is-near/intents-connect-wallet/connect/appkit';
import { RUN_BUSY_NOTE, useRunBusy } from '../features/run/busy.ts';
import { Address, Button, ChainIcon, Popover, Skeleton, buttonClass, buttonLook, chainMeta, chainOfCaip, cn, copyText, toast, truncateMiddle } from '../ui/index.ts';
import { ConnectingLabel, ConnectLabel } from './WalletPlaceholder.tsx';

// Looked up once per address: it never changes for a wallet, and every open of the menu would ask again otherwise.
const known = new Map<string, Intermediary>();

// useAsync of ui.tsx, word for word. The wallet code loads on the landing page too, and ui.tsx would bring recipe.ts,
// @connect-anything/core and Anchor into it.
function useAsync<T>(load: (() => Promise<T>) | null, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: Error }>({});
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setState({});
    if (!load) return;
    let live = true;
    load().then(
      data => live && setState({ data }),
      error => live && setState({ error }),
    );
    return () => {
      live = false;
    };
  }, [...deps, tick]);
  return { ...state, loading: !!load && state.data === undefined && !state.error, retry: () => setTick(value => value + 1) };
}

function useIntermediary(address: string) {
  const { api } = useIntentsConnect();
  const cached = known.get(address);
  const lookup = useAsync(
    cached ? null : () => api.getIntermediary(address).then(found => (known.set(address, found), found)),
    [address, !!cached],
  );
  return cached ? { data: cached, error: undefined, loading: false, retry: lookup.retry } : lookup;
}

function IntermediaryRow({ address }: { address: string }) {
  const { data, error, loading, retry } = useIntermediary(address);
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">Your Solana intermediary</span>
        <ChainIcon chain="sol" size={16} />
      </div>
      <div className="mt-1.5 min-h-6">
        {loading && <Skeleton className="h-5 w-40" />}
        {error && (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-danger-text">
            Could not look it up.
            <button type="button" onClick={retry} className="link text-sm">
              Try again
            </button>
          </p>
        )}
        {data && (data.solana ? <Address value={data.solana} chain="sol" chars={6} /> : <p className="text-sm text-muted">Solana is not enabled for this Connect key yet.</p>)}
      </div>
      <p className="mt-1.5 text-xs leading-4 text-muted">The account on Solana that runs instructions for this wallet. What a run does not spend stays there.</p>
    </div>
  );
}

type WalletButtonProps = {
  className?: string;
  /** Opens AppKit's modal as soon as AppKit is up: the person clicked the header's placeholder before the wallet code had loaded. */
  connectNow?: boolean;
  /** Called when that connect starts, so it starts once. */
  onConnectStarted?: () => void;
  /** The placeholder had focus, so this takes it over. */
  focusOnMount?: boolean;
};

/**
 * The header's wallet: connect, then a menu with the address, the Solana intermediary of an EVM wallet, and Disconnect.
 * Below 400px wide the button reads "Connect", and its name stays "Connect wallet".
 */
export function WalletButton({ className, connectNow = false, onConnectStarted, focusOnMount = false }: WalletButtonProps) {
  const { wallet } = useIntentsConnect();
  const { connect, disconnect, isConnecting, isConnected, address, caipAddress } = useIntentsConnectWallet();
  const appKit = useContext(AppKitContext)?.appKit;
  // a run in flight is followed with this wallet, so it stays connected until the run ends
  const running = useRunBusy();
  const why = useId();

  const start = async () => {
    try {
      await connect();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      // closing the modal is an answer, not an error
      if (!/cancel|reject|denied/i.test(message)) toast.error('Could not connect the wallet', { description: message });
    }
  };

  // AppKit is created in its provider's effect, so a click that came before it waits for it here
  useEffect(() => {
    if (!connectNow || !appKit) return;
    onConnectStarted?.();
    if (!isConnected) void start();
  }, [connectNow, appKit]);

  useEffect(() => {
    if (focusOnMount) document.querySelector<HTMLElement>('[data-wallet]')?.focus();
  }, []);

  if (!isConnected || !address) {
    return (
      <Button variant="soft" size="sm" icon={<Wallet />} loading={isConnecting} onClick={start} className={className} data-wallet="disconnected">
        {isConnecting ? <ConnectingLabel /> : <ConnectLabel />}
      </Button>
    );
  }

  const { chain, reference } = chainOfCaip(caipAddress);
  const meta = chain ? chainMeta(chain) : undefined;
  const network = meta?.name ?? (reference ? `Chain ${reference}` : 'Unknown network');
  const isEvm = wallet?.signingStandard === 'erc191';

  return (
    <Popover
      className={className}
      label="Wallet"
      panelClassName="w-[22rem]"
      trigger={
        <button type="button" data-ui="button" data-wallet="connected" aria-label={`Wallet ${truncateMiddle(address)} on ${network}`} className={cn(buttonLook('secondary'), 'group h-8 gap-2 pr-2 pl-2.5 text-sm font-medium data-open:border-border-strong data-open:bg-surface-3')}>
          {chain ? <ChainIcon chain={chain} size={16} /> : <span className="size-2 rounded-full bg-success" aria-hidden />}
          <span className="font-mono text-[13px] tracking-tight">{truncateMiddle(address)}</span>
          <ChevronDown className="size-3.5 text-muted transition-transform duration-120 group-data-open:rotate-180" aria-hidden />
        </button>
      }
    >
      {({ close }) => (
        <div className="flex flex-col gap-2">
          <div className="px-1.5 pt-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <span className="size-1.5 rounded-full bg-success" aria-hidden />
                Connected on {network}
              </span>
              {chain && <ChainIcon chain={chain} size={16} />}
            </div>
            <p className="mt-2 font-mono text-xs leading-5 text-balance break-all text-text select-all">{address}</p>
            <div className="mt-1.5 -ml-2 flex flex-wrap gap-0.5">
              <Button variant="ghost" size="xs" icon={<Copy />} onClick={() => void copyText(address, 'Address copied')}>
                Copy address
              </Button>
              {meta && (
                <a href={`${meta.address}${address}`} target="_blank" rel="noreferrer" className={buttonClass({ variant: 'ghost', size: 'xs' })}>
                  {meta.explorer}
                  <ArrowUpRight className="size-3.5" aria-hidden />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </div>
          </div>
          {isEvm && <IntermediaryRow address={address} />}
          <div className="border-t border-border pt-1.5">
            <Button
              variant="ghost"
              size="sm"
              block
              icon={<LogOut />}
              className="justify-start"
              disabled={running}
              aria-describedby={running ? why : undefined}
              onClick={() => {
                close();
                void disconnect();
              }}
            >
              Disconnect
            </Button>
            {running && (
              <p id={why} className="px-2.5 pt-0.5 pb-1 text-xs leading-4 text-muted">
                {RUN_BUSY_NOTE}
              </p>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}

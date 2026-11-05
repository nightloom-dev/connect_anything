import { ChevronDown, LogOut, Wallet } from 'lucide-react';
import type { Intermediary } from '@aurora-is-near/intents-connect';
import { useIntentsConnect } from '@aurora-is-near/intents-connect/react';
import { useIntentsConnectWallet } from '@aurora-is-near/intents-connect-wallet/connect/appkit';
import { useAsync } from '../ui.tsx';
import { Address, Button, ChainIcon, Popover, Skeleton, buttonLook, chainMeta, chainOfCaip, cn, toast, truncateMiddle } from '../ui/index.ts';

// Looked up once per address: it never changes for a wallet, and every open of the menu would ask again otherwise.
const known = new Map<string, Intermediary>();

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
        <ChainIcon chain="sol" size={14} />
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

/** The header's wallet: connect, then a menu with the address, the Solana intermediary of an EVM wallet, and Disconnect. */
export function WalletButton({ className }: { className?: string }) {
  const { wallet } = useIntentsConnect();
  const { connect, disconnect, isConnecting, isConnected, address, caipAddress } = useIntentsConnectWallet();

  const start = async () => {
    try {
      await connect();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      // closing the modal is an answer, not an error
      if (!/cancel|reject|denied/i.test(message)) toast.error('Could not connect the wallet', { description: message });
    }
  };

  if (!isConnected || !address) {
    return (
      <Button variant="soft" size="sm" icon={<Wallet />} loading={isConnecting} onClick={start} className={className}>
        {isConnecting ? 'Connecting…' : 'Connect wallet'}
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
      panelClassName="w-80"
      trigger={
        <button type="button" data-ui="button" aria-label={`Wallet ${truncateMiddle(address)} on ${network}`} className={cn(buttonLook('secondary'), 'group h-8 gap-2 pr-2 pl-2.5 text-sm font-medium data-open:border-border-strong data-open:bg-surface-3')}>
          {chain ? <ChainIcon chain={chain} size={16} /> : <span className="size-2 rounded-full bg-success" aria-hidden />}
          <span className="font-mono text-[13px] tracking-tight">{truncateMiddle(address)}</span>
          <ChevronDown className="size-3.5 text-muted transition-transform duration-120 group-data-open:rotate-180" aria-hidden />
        </button>
      }
    >
      {({ close }) => (
        <div className="flex flex-col gap-1.5">
          <div className="px-1.5 pt-1.5 pb-1">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <span className="size-1.5 rounded-full bg-success" aria-hidden />
              Connected on {network}
            </span>
            <Address value={address} chain={chain ?? ''} full className="mt-1.5" />
          </div>
          {isEvm && <IntermediaryRow address={address} />}
          <div className="mt-0.5 border-t border-border pt-1.5">
            <Button
              variant="ghost"
              size="sm"
              block
              icon={<LogOut />}
              className="justify-start"
              onClick={() => {
                close();
                void disconnect();
              }}
            >
              Disconnect
            </Button>
          </div>
        </div>
      )}
    </Popover>
  );
}

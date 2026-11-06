import { useContext, useEffect } from 'react';
import { AppKitContext } from '@aurora-is-near/intents-connect-wallet/connect/appkit';

// AppKit starts on the first network of its list, Ethereum, and an EVM wallet that connects is asked to switch to the
// network AppKit is on: a wallet on Base would be moved to Ethereum, and the run would then ask to move it back to Base,
// two prompts. Base is where a payment starts unless the person picks another chain, so while no wallet is connected
// AppKit is put on Base. Without a connected wallet this only changes AppKit's own state and asks the wallet nothing.
// A network AppKit remembers from an earlier visit, or one the person picked in its modal, is left as it is.

const BASE = 8453;
const ETHEREUM = 1;

/** Puts AppKit on Base before a wallet connects, in place of the Ethereum it starts on. */
export function AppKitNetwork() {
  const appKit = useContext(AppKitContext)?.appKit;
  useEffect(() => {
    if (!appKit || appKit.getIsConnectedState()) return;
    const active = appKit.getCaipNetwork('eip155');
    const base = appKit.getCaipNetworks('eip155').find(({ id }) => id === BASE);
    if (base && (!active || active.id === ETHEREUM)) void appKit.switchNetwork(base);
  }, [appKit]);
  return null;
}

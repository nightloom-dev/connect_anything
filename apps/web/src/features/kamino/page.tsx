import { usePageTitle } from '../../app/title.ts';
import { Rescue } from './rescue.tsx';

/** /kamino: read a wallet's Kamino positions and repay a debt from an EVM chain. */
export default function KaminoPage() {
  usePageTitle('Rescue Kamino');
  return <Rescue />;
}

import { Plus, Trash2 } from 'lucide-react';
import { AddressInput, Button, Checkbox, IconButton } from '../../ui/index.ts';

type Row = { pubkey: string; isWritable: boolean };

type RemainingProps = {
  rows: Row[];
  onPubkey: (index: number, pubkey: string) => void;
  onWritable: (index: number, isWritable: boolean) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
};

export const remainingAnchor = (index: number) => `remaining-${index}`;

/** Accounts after those the IDL names, in order: an address, whether it is written, and a way to drop it. */
export function RemainingAccounts({ rows, onPubkey, onWritable, onRemove, onAdd }: RemainingProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {rows.length > 0 && (
        <ol className="flex min-w-0 flex-col divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
          {rows.map(({ pubkey, isWritable }, index) => (
            <li key={index} id={remainingAnchor(index)} className="flex min-w-0 scroll-mt-24 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap">
              <span aria-hidden className="w-5 shrink-0 text-right text-xs text-muted nums">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 basis-60">
                <AddressInput aria-label={`Remaining account ${index + 1}`} placeholder="Address" size="sm" value={pubkey} onChange={value => onPubkey(index, value)} />
              </div>
              <span className="flex shrink-0 items-center gap-2 max-sm:ml-8">
                <Checkbox
                  label={
                    <>
                      Writable<span className="sr-only"> (remaining account {index + 1})</span>
                    </>
                  }
                  checked={isWritable}
                  onChange={checked => onWritable(index, checked)}
                />
                <IconButton label={`Remove remaining account ${index + 1}`} icon={<Trash2 />} onClick={() => onRemove(index)} />
              </span>
            </li>
          ))}
        </ol>
      )}
      <Button size="sm" variant="ghost" icon={<Plus />} className="self-start" onClick={onAdd}>
        Add remaining account
      </Button>
    </div>
  );
}

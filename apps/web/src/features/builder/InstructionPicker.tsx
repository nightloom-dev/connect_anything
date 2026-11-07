import { useCallback } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { Address, Badge, Button, Combobox, cn } from '../../ui/index.ts';
import { breakable } from './breakable.tsx';

/** One instruction of the IDL, with what Connect would refuse about it, worked out once for the whole list. */
export type InstructionOption = { name: string; args: number; accounts: number; docs?: string; issues: string[] };

const number = new Intl.NumberFormat('en-US');
const plural = (count: number, one: string) => `${number.format(count)} ${one}${count === 1 ? '' : 's'}`;

type ProgramBarProps = { name: string; address: string; onBack: () => void };

/** The program whose instructions are listed, and the way back to load another. */
export function ProgramBar({ name, address, onBack }: ProgramBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-border bg-surface px-4 py-3">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-md border border-accent/40 bg-accent/8 font-mono text-sm font-semibold text-accent">
        {name[0]?.toUpperCase()}
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <p className="truncate text-sm font-medium text-text">{name}</p>
        <Address value={address} full className="text-muted [&>span:first-child]:text-xs [&>span:first-child]:text-muted" />
      </div>
      <Button size="sm" icon={<ArrowLeftRight />} onClick={onBack}>
        Load another program
      </Button>
    </div>
  );
}

type PickerProps = {
  options: InstructionOption[];
  value?: string;
  onChange: (name: string) => void;
  disabled?: boolean;
};

/** Every instruction, searched by name or docs as you type, with its size and whether Connect can run it. */
export function InstructionPicker({ options, value, onChange, disabled }: PickerProps) {
  const chosen = options.find(option => option.name === value) ?? null;
  const unsupported = options.filter(option => option.issues.length > 0).length;
  const filter = useCallback((option: InstructionOption, query: string) => {
    const words = query.trim().toLowerCase();
    return option.name.toLowerCase().includes(words) || !!option.docs?.toLowerCase().includes(words);
  }, []);
  const getKey = useCallback((option: InstructionOption) => option.name, []);
  return (
    <Combobox
      label="Instruction"
      size="lg"
      value={chosen}
      onChange={option => option && onChange(option.name)}
      options={options}
      getKey={getKey}
      getLabel={getKey}
      filter={filter}
      disabled={disabled}
      placeholder="Search by name, as repay or swap"
      empty="No instruction has that in its name or docs."
      hint={
        <span className="nums">
          {plural(options.length, 'instruction')}
          {unsupported > 0 && `, ${number.format(unsupported)} not supported by Connect`}
        </span>
      }
      renderOption={renderOption}
    />
  );
}

const renderOption = (option: InstructionOption) => <InstructionRow option={option} />;

/** A row of the list: the name, whether Connect can run it, its size and the first line of its docs. */
export function InstructionRow({ option }: { option: InstructionOption }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 py-0.5">
      <span className="flex min-w-0 items-center gap-2">
        <span className={cn('min-w-0 font-mono text-[13px] [overflow-wrap:anywhere]', option.issues.length ? 'text-muted' : 'text-text')}>{breakable(option.name)}</span>
        {option.issues.length > 0 && (
          <Badge variant="bad" title={option.issues.join(' ')}>
            Not supported
          </Badge>
        )}
      </span>
      <span className="text-xs text-muted nums">
        {plural(option.args, 'argument')}, {plural(option.accounts, 'account')}
      </span>
      {option.docs && <span className="truncate text-xs text-muted">{option.docs}</span>}
    </span>
  );
}

import type { ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import type { Field, FieldType } from '@connect-anything/core';
import { defaultValue, isByte, variantValue } from '../../recipe.ts';
import { Button, Checkbox, IconButton, Input, Select, Switch, cn } from '../../ui/index.ts';
import { AddressField } from './AddressField.tsx';
import { breakable } from './breakable.tsx';
import type { QuickPick } from './known.ts';

export const typeLabel = (type: FieldType): string => {
  switch (type.kind) {
    case 'int':
    case 'float':
      return type.type;
    case 'pubkey':
      return 'public key';
    case 'bytes':
      return 'hex bytes';
    case 'option':
      return `optional ${typeLabel(type.of)}`;
    case 'vec':
      return isByte(type.of) ? 'hex bytes' : `list of ${typeLabel(type.of)}`;
    case 'array':
      return isByte(type.of) ? `${type.len} hex bytes` : `${type.len} × ${typeLabel(type.of)}`;
    case 'struct':
    case 'enum':
      return type.type ?? type.kind;
    default:
      return type.kind;
  }
};

/** What a public key argument offers: the intermediary, the known addresses, and those its name points at. */
export type KeyPicks = { intermediary: string; known: QuickPick[]; suggest?: (name: string) => QuickPick[] };

type InputProps = { type: FieldType; label: string; value: any; onChange: (value: unknown) => void; disabled?: boolean; picks: KeyPicks; placeholder?: string };

/** One value of an instruction's arguments, in the shape the coder takes. Nested types nest. */
export function FieldInput({ type, label, value, onChange, disabled, picks, placeholder }: InputProps) {
  const text = (hint: string, inputMode?: 'numeric' | 'decimal', mono = true) => (
    <Input aria-label={label} placeholder={placeholder ?? hint} inputMode={inputMode} spellCheck={false} autoComplete="off" mono={mono} disabled={disabled} value={value} onChange={event => onChange(event.target.value)} />
  );
  switch (type.kind) {
    case 'int':
      return text(type.type, 'numeric');
    case 'float':
      return text(type.type, 'decimal');
    case 'string':
      return text('text', undefined, false);
    case 'bytes':
      return text('hex');
    case 'bool':
      return (
        <Switch
          label={
            <>
              <span className="sr-only">{label}</span>
              <span aria-hidden className="font-mono text-[13px] font-normal text-muted">
                {value ? 'true' : 'false'}
              </span>
            </>
          }
          checked={value}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case 'pubkey':
      return <AddressField label={label} value={value} onChange={onChange} disabled={disabled} intermediary={picks.intermediary} known={picks.known} suggestions={picks.suggest?.(label)} />;
    case 'option':
      return (
        <div className="flex flex-col gap-2.5">
          <Checkbox
            label={
              <>
                Set a value<span className="sr-only"> for {label}</span>
              </>
            }
            checked={value !== null}
            disabled={disabled}
            onChange={checked => onChange(checked ? defaultValue(type.of) : null)}
          />
          {value !== null && <FieldInput type={type.of} label={label} value={value} onChange={onChange} disabled={disabled} picks={picks} />}
        </div>
      );
    case 'vec':
    case 'array': {
      if (isByte(type.of)) return text(type.kind === 'array' ? `${type.len} bytes as hex` : 'hex');
      const items = value as unknown[];
      return (
        <div className="flex flex-col gap-2 border-l border-border-strong pl-3.5">
          {items.length === 0 && <p className="text-xs text-muted">No items.</p>}
          {items.map((item, index) => (
            <div className="flex items-start gap-2" key={index}>
              <span className="mt-2.5 w-5 shrink-0 text-right text-xs text-muted nums" aria-hidden>
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <FieldInput type={type.of} label={`${label} ${index + 1}`} value={item} disabled={disabled} picks={picks} onChange={next => onChange(items.map((old, at) => (at === index ? next : old)))} />
              </div>
              {type.kind === 'vec' && <IconButton label={`Remove ${label} ${index + 1}`} icon={<X />} size="md" disabled={disabled} onClick={() => onChange(items.filter((_, at) => at !== index))} />}
            </div>
          ))}
          {type.kind === 'vec' && (
            <Button size="sm" variant="ghost" icon={<Plus />} disabled={disabled} className="self-start" onClick={() => onChange([...items, defaultValue(type.of)])}>
              Add item
            </Button>
          )}
        </div>
      );
    }
    case 'struct':
      return (
        <div className="flex flex-col gap-4 border-l border-border-strong pl-3.5">
          {type.fields.map(field => (
            <Labeled key={field.name} field={field} label={`${label}.${field.name}`} value={value[field.name]} disabled={disabled} picks={picks} onChange={next => onChange({ ...value, [field.name]: next })} />
          ))}
        </div>
      );
    case 'enum': {
      const name: string = typeof value === 'string' ? value : Object.keys(value)[0];
      const fields = type.variants.find(variant => variant.name === name)?.fields ?? [];
      return (
        <div className="flex flex-col gap-3">
          <Select
            aria-label={label}
            value={name}
            disabled={disabled}
            options={type.variants.map(variant => ({ value: variant.name, label: <span className="font-mono text-[13px]">{variant.name}</span> }))}
            onChange={next => onChange(variantValue(type.variants.find(variant => variant.name === next)!))}
          />
          {fields.length > 0 && (
            <div className="flex flex-col gap-4 border-l border-border-strong pl-3.5">
              {fields.map(field => (
                <Labeled key={field.name} field={field} label={`${label}.${field.name}`} value={value[name][field.name]} disabled={disabled} picks={picks} onChange={next => onChange({ [name]: { ...value[name], [field.name]: next } })} />
              ))}
            </div>
          )}
        </div>
      );
    }
  }
}

type LabeledProps = Omit<InputProps, 'type'> & {
  field: Field;
  /** On the field's own box, for the links of the readiness list. */
  id?: string;
  /** Under the input: the switch of the amount delivered. */
  children?: ReactNode;
  className?: string;
};

/** A field with its name, type and docs above it. */
export function Labeled({ field, label, children, id, className, ...input }: LabeledProps) {
  return (
    <div id={id} className={cn('flex min-w-0 scroll-mt-24 flex-col gap-2', className)}>
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <span className="min-w-0 font-mono text-[13px] font-medium [overflow-wrap:anywhere] text-text">{breakable(field.name)}</span>
        <span className="shrink-0 text-xs text-muted">{typeLabel(field)}</span>
      </div>
      {field.docs && <p className="-mt-1 text-xs leading-5 text-muted">{field.docs.join(' ')}</p>}
      <FieldInput type={field} label={label} {...input} />
      {children}
    </div>
  );
}

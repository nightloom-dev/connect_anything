import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { PublicKey } from '@solana/web3.js';
import { CircleCheck, ClipboardPaste, X } from 'lucide-react';
import { Button } from './Button.tsx';
import { IconButton } from './IconButton.tsx';
import { Input, type InputProps } from './Input.tsx';
import { toast } from './Toaster.tsx';

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

/** Why a text is not a Solana address (base58 of 32 bytes), or null when it is one or is empty. */
export function solanaAddressProblem(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (!BASE58.test(text)) return 'A Solana address is base58: letters and digits, without 0, O, I or l.';
  try {
    new PublicKey(text);
    return null;
  } catch {
    return 'A Solana address is 32 bytes, 32 to 44 characters of base58, and this is not.';
  }
}

export const isSolanaAddress = (value: string) => !!value.trim() && solanaAddressProblem(value) === null;

export type AddressInputProps = Omit<InputProps, 'value' | 'onChange' | 'trailing' | 'mono' | 'type'> & {
  value: string;
  /** Gets the text trimmed. */
  onChange: (value: string) => void;
  /** Check that it is a Solana address and say why not. On by default. */
  check?: boolean;
  /** An error from outside, as a 400 from the server. Shown in place of the check's. */
  error?: ReactNode;
  /** The Paste button, shown while the field is empty. */
  paste?: boolean;
  /** The Clear button, shown once it is not. */
  clear?: boolean;
};

/**
 * Monospace, checked as you type. A wrong character is flagged at once; a wrong length only after the field loses
 * focus or reaches the length of an address, so that half a paste is not called an error.
 */
export const AddressInput = forwardRef<HTMLInputElement, AddressInputProps>(function AddressInput(
  { value, onChange, check = true, error, paste = true, clear = true, onBlur, disabled, placeholder = 'Solana address', ...rest },
  ref,
) {
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => input.current!);
  const [touched, setTouched] = useState(false);

  const problem = check ? solanaAddressProblem(value) : null;
  const badCharacter = !!value.trim() && !BASE58.test(value.trim());
  const shown = error ?? (problem && (touched || badCharacter || value.trim().length >= 44) ? problem : undefined);
  const valid = check && !error && isSolanaAddress(value);
  const canPaste = paste && typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;

  const pasteIn = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) {
        onChange(text);
        setTouched(true);
      }
    } catch {
      toast.error('The browser did not allow reading the clipboard. Paste with Ctrl+V or ⌘V instead.');
    }
    input.current?.focus();
  };

  return (
    <Input
      {...rest}
      ref={input}
      mono
      type="text"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      spellCheck={false}
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      error={shown}
      onChange={event => onChange(event.target.value.trim())}
      onBlur={event => {
        setTouched(true);
        onBlur?.(event);
      }}
      trailing={
        <>
          {valid && <CircleCheck className="mr-1 size-4 text-success" aria-label="A valid Solana address" role="img" />}
          {value
            ? clear &&
              !disabled && (
                <IconButton
                  label="Clear"
                  size="xs"
                  icon={<X />}
                  onClick={() => {
                    onChange('');
                    setTouched(false);
                    input.current?.focus();
                  }}
                />
              )
            : canPaste &&
              !disabled && (
                <Button size="xs" variant="ghost" icon={<ClipboardPaste />} onClick={pasteIn}>
                  Paste
                </Button>
              )}
        </>
      }
    />
  );
});

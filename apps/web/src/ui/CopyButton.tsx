import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { IconButton } from './IconButton.tsx';
import { toast } from './Toaster.tsx';
import { Tooltip } from './Tooltip.tsx';

/** Copies and says so in a toast. False when the browser refused, and the toast then says to copy by hand. */
export async function copyText(text: string, message = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
    return true;
  } catch {
    toast.error('Could not copy. Select the text and copy it by hand.');
    return false;
  }
}

type CopyButtonProps = {
  value: string;
  /** What it copies, as in "Copy address". */
  label?: string;
  /** The toast. */
  message?: string;
  size?: 'xs' | 'sm' | 'md';
  /** The tooltip in place of the label, as the whole of what it copies, which it then describes the button with. */
  tip?: ReactNode;
  className?: string;
};

export function CopyButton({ value, label = 'Copy', message, size = 'xs', tip, className }: CopyButtonProps) {
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    if (!(await copyText(value, message))) return;
    setDone(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(false), 1500);
  };
  const button = (
    <IconButton
      label={label}
      size={size}
      className={className}
      icon={done ? <Check className="text-success" strokeWidth={2.5} /> : <Copy />}
      tooltip={!tip}
      onClick={copy}
    />
  );
  return tip ? (
    <Tooltip content={tip} wide>
      {button}
    </Tooltip>
  ) : (
    button
  );
}

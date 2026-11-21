import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyText } from '../clipboard';

interface Props {
  text: string;
  /** What is copied, for screen readers and the tooltip, e.g. "title". */
  label: string;
  className?: string;
  /** 'reveal': hidden until its row is hovered (always shown on touch screens, which can't hover). */
  reveal?: boolean;
  size?: number;
}

/** A small copy icon that turns into a check mark for a moment once copied. */
export default function CopyButton({ text, label, className = '', reveal = false, size = 14 }: Props) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await copyText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 1500);
  }

  const title = state === 'copied' ? 'Copied' : state === 'failed' ? "Couldn't copy" : `Copy ${label}`;
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={title}
      title={title}
      className={`inline-flex shrink-0 items-center justify-center rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:opacity-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 ${
        reveal ? 'opacity-0 group-hover/copy:opacity-100 [@media(hover:none)]:opacity-100' : ''
      } ${state === 'copied' ? 'text-green-600! opacity-100 dark:text-green-400!' : ''} ${state === 'failed' ? 'text-red-600! opacity-100' : ''} ${className}`}
    >
      {state === 'copied' ? <Check size={size} aria-hidden /> : <Copy size={size} aria-hidden />}
    </button>
  );
}

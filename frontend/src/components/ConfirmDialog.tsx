import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  /** Shown on the confirm button while `busy`. */
  busyLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  /** Called on Cancel, Esc or a backdrop click. */
  onCancel: () => void;
}

/**
 * Small floating confirmation for destructive actions, centered on every screen size.
 * A native <dialog> like Modal, so it also stacks on top of an open Modal. Cancel gets the focus.
 */
export default function ConfirmDialog({ open, title, children, confirmLabel, busyLabel, busy, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current!;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation(); // don't close a Modal underneath
        if (!busy) onCancel();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel(); // click on the backdrop
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm dark:bg-slate-900 dark:text-slate-100 dark:ring-1 dark:ring-slate-700"
    >
      {open && (
        <>
          <h2 id={titleId} className="font-semibold">
            {title}
          </h2>
          {children && <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">{children}</div>}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              autoFocus
              onClick={onCancel}
              disabled={busy}
              className="rounded-md px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button type="button" onClick={onConfirm} disabled={busy} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
              {busy && busyLabel ? busyLabel : confirmLabel}
            </button>
          </div>
        </>
      )}
    </dialog>,
    document.body,
  );
}

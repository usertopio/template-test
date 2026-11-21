import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  /** Called on Esc, backdrop click or the close button; the parent decides whether to actually close. */
  onRequestClose: () => void;
  children: ReactNode;
}

/**
 * Floating dialog built on native <dialog>, which gives us focus trapping, Esc handling,
 * a backdrop and focus restoration for free. Full screen on phones, centered box on larger screens.
 */
export default function Modal({ open, title, onRequestClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault(); // let the parent handle Esc (e.g. to confirm discarding changes)
        onRequestClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onRequestClose(); // click on the backdrop
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none flex-col bg-white text-slate-900 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm open:flex sm:m-auto sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-xl dark:bg-slate-900 dark:text-slate-100 dark:ring-1 dark:ring-slate-700"
    >
      <header className="flex items-center justify-between border-b border-slate-200 px-5 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 sm:pt-3 dark:border-slate-800">
        <h2 id="modal-title" className="font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onRequestClose}
          aria-label="Close"
          className="-mr-2 rounded-md p-2.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>
      {open && children}
    </dialog>
  );
}

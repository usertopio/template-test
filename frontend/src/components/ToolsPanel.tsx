import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, X } from 'lucide-react';

/**
 * Where a page's tools go, set up by the app shell: `panel`, a column on the right of the page; `topBar`, the
 * phone's top bar (for the button opening them). Unset (e.g. a page rendered on its own in tests), they stay in place.
 */
export const ToolsSlots = createContext<{ panel: HTMLElement | null; topBar: HTMLElement | null }>({ panel: null, topBar: null });

/** Wide enough for the panel to stay open beside the list (Tailwind's xl). */
const WIDE = '(min-width: 1280px)';

const place = (node: ReactNode, slot: HTMLElement | null) => (slot ? createPortal(node, slot) : node);

/**
 * A page's tools (search, filters, download, export): a column on the right on wide screens, and below that the
 * same panel sliding in from the right, like the menu does from the left. One panel either way, so the tools
 * never differ between a phone and a desktop; CSS decides which it is.
 */
export function ToolsPanel({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const { panel } = useContext(ToolsSlots);

  // Esc closes it, and the page behind doesn't scroll while it's over it. Widening the window past the drawer
  // closes it too, so the page isn't left locked.
  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia?.(WIDE);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onWide = () => wide?.matches && onClose();
    document.addEventListener('keydown', onKey);
    wide?.addEventListener('change', onWide);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      wide?.removeEventListener('change', onWide);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return place(
    <>
      <div aria-hidden onClick={onClose} className={`fixed inset-0 z-40 bg-slate-950/60 transition-opacity xl:hidden ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} />
      {/* Closed below xl it's invisible, which also takes it out of the tab order. */}
      <aside
        aria-label="Tools"
        className={`fixed inset-y-0 right-0 z-50 flex w-80 max-w-[85vw] flex-col bg-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-xl transition-[transform,visibility] dark:bg-slate-900 ${open ? 'visible translate-x-0' : 'invisible translate-x-full'} xl:visible xl:sticky xl:top-0 xl:z-auto xl:h-dvh xl:w-72 xl:max-w-none xl:shrink-0 xl:translate-x-0 xl:border-l xl:border-slate-200 xl:shadow-none xl:dark:border-slate-800`}
      >
        <div className="flex items-center justify-between py-3 pr-2 pl-5">
          <span className="flex items-center gap-2 font-semibold">
            <SlidersHorizontal size={18} aria-hidden />
            Tools
          </span>
          <button type="button" onClick={onClose} aria-label="Close tools" className="rounded-md p-2.5 text-slate-500 hover:bg-slate-100 xl:hidden dark:text-slate-400 dark:hover:bg-slate-800">
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
      </aside>
    </>,
    panel,
  );
}

/**
 * Opens the tools where they slide in: in the phone's top bar, and in the page header up to xl, where the panel
 * is always open. `active`: how many filters are on, shown on the button so a narrowed list is never a surprise.
 */
export function ToolsButton({ open, onOpen, active }: { open: boolean; onOpen: () => void; active: number }) {
  const { topBar } = useContext(ToolsSlots);
  const button = (className: string) => (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={open}
      aria-label={active ? `Tools, ${active} filter${active === 1 ? '' : 's'} on` : 'Tools'}
      className={`relative items-center gap-1.5 rounded-md text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${className}`}
    >
      <SlidersHorizontal size={20} aria-hidden />
      {active > 0 && (
        <span aria-hidden className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
          {active}
        </span>
      )}
    </button>
  );
  if (!topBar) return button('inline-flex p-2.5 xl:hidden');
  return (
    <>
      {createPortal(button('inline-flex p-2.5 md:hidden'), topBar)}
      {button('hidden p-2.5 md:inline-flex xl:hidden')}
    </>
  );
}

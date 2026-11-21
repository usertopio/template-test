import { createContext, useContext, type MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ORGANIZATIONS } from '@profile/shared';

/** What to preview: an entry by id, or an organization by name (entries name their organization rather than link it). */
export type PreviewTarget = { section: string; id: string } | { section: typeof ORGANIZATIONS; name: string };

/** Opens a preview on top of the ones already open (see PreviewProvider). */
export const PreviewContext = createContext<((target: PreviewTarget) => void) | null>(null);

/** The page for a target: its section, searched for the organization's name. */
export const pageOf = (target: PreviewTarget) => ('name' in target ? `/${ORGANIZATIONS}?q=${encodeURIComponent(target.name)}` : `/${target.section}`);

/**
 * Props for a <Link> that opens a preview instead of leaving the page. It stays a real link, so Ctrl/⌘-click
 * and a middle click still open the page in a new tab.
 */
export function usePreviewLink() {
  const open = useContext(PreviewContext);
  return (target: PreviewTarget) => ({
    to: pageOf(target),
    onClick: (e: MouseEvent) => {
      if (!open || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      open(target);
    },
  });
}

/** Opens a preview straight away (a list card opening its own entry); null outside a PreviewProvider. */
export const useOpenPreview = () => useContext(PreviewContext);

/** Closes every open preview (see PreviewProvider). */
export const ClosePreviewContext = createContext<(() => void) | null>(null);

/**
 * Shows `section`'s list filtered to `value` for filter `key` (see filterValueOf), closing any preview. On that
 * list already, the filter replaces the one for `key` and the others stay; from elsewhere it's the only one.
 */
export function useFilterBy() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const close = useContext(ClosePreviewContext);
  return (section: string, key: string, value: string) => {
    const page = `/${section}`;
    const params = new URLSearchParams(pathname === page ? search : '');
    params.delete(key);
    params.append(key, value);
    close?.();
    navigate(`${page}?${params}`, { replace: pathname === page });
  };
}

import { useSyncExternalStore } from 'react';

// Entries whose media are folded away on their cards (see CardMedia), so a long list of files doesn't bury the
// next entry. Remembered in this browser.
const HIDDEN_KEY = 'hiddenMedia';
let hidden = readHidden();
const listeners = new Set<() => void>();

function readHidden(): ReadonlySet<string> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]');
    return new Set(Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export function setMediaHidden(entryId: string, hide: boolean) {
  const next = new Set(hidden);
  if (hide) next.add(entryId);
  else next.delete(entryId);
  hidden = next;
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
  } catch {
    // storage unavailable (private mode); the choice just won't persist
  }
  listeners.forEach((l) => l());
}

export function useMediaHidden(entryId: string): boolean {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => hidden,
  ).has(entryId);
}

// New entries not saved yet, kept in this browser as they're typed, so closing the form or reloading the page loses
// nothing (see EntryForm's `backupKey`). They reach the sheet only with Save or Save draft.
const PREFIX = 'newEntry:';

export function readBackup(key: string): Record<string, string> | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(PREFIX + key) ?? 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
    return Object.fromEntries(Object.entries(saved).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  } catch {
    return null;
  }
}

export function writeBackup(key: string, values: Record<string, string>) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(values));
  } catch {
    // storage unavailable (private mode) or full; the form just isn't kept
  }
}

export function clearBackup(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // storage unavailable; nothing was kept either
  }
}

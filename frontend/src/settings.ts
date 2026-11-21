import { useSyncExternalStore } from 'react';
import { LANGUAGES, SECTIONS, type Language } from '@profile/shared';

/**
 * How the app opens, set on the Settings page: the page it starts on, and the language the profile starts in ('':
 * the one used last). Kept in this browser like the theme, so a phone and a laptop can each start their own way.
 */
export interface Settings {
  startPage: string;
  startLanguage: Language | '';
}

const SETTINGS_KEY = 'settings';
export const DEFAULT_SETTINGS: Settings = { startPage: 'about', startLanguage: '' };
let settings = readSettings();
const listeners = new Set<() => void>();

function readSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>;
    return {
      // A section that no longer exists (renamed in sections.ts) falls back rather than opening a dead route.
      startPage: SECTIONS.find((s) => s.key === saved.startPage)?.key ?? DEFAULT_SETTINGS.startPage,
      startLanguage: LANGUAGES.find((l) => l === saved.startLanguage) ?? '',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const getSettings = () => settings;

export function updateSettings(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable (private mode); the choice holds until the page is reloaded
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => settings,
  );
}

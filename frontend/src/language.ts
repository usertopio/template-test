import { createContext, useContext, useSyncExternalStore } from 'react';
import { DOMAIN_LIST, LANGUAGES, LOCATION_LIST, ORGANIZATIONS, SKILLS, localizeEntry, type Language, type SectionDef } from '@profile/shared';
import { useEntriesBySection } from './api';
import { getSettings } from './settings';

// Which version of the profile is shown: English or Thai (see LANGUAGES). It opens in the one set on the Settings
// page, otherwise the one used last.
const LANGUAGE_KEY = 'language';
let language = readLanguage();
const listeners = new Set<() => void>();

function readLanguage(): Language {
  const start = getSettings().startLanguage;
  if (start) return start;
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    return LANGUAGES.find((l) => l === saved) ?? 'en';
  } catch {
    return 'en';
  }
}

export function setLanguage(next: Language) {
  language = next;
  try {
    localStorage.setItem(LANGUAGE_KEY, next);
  } catch {
    // storage unavailable (private mode); the choice just won't persist
  }
  listeners.forEach((l) => l());
}

/**
 * Shows what's inside in another language than the profile's, e.g. an entry's popup switched to Thai while the
 * page stays in English. null: the profile's language.
 */
export const ShownIn = createContext<Language | null>(null);

export function useLanguage(): Language {
  const shownIn = useContext(ShownIn);
  const profile = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => language,
  );
  return shownIn ?? profile;
}

/**
 * Shows an entry in the profile's language: its Thai text, with organizations, skills, domains and places by
 * their Thai names (from the Organizations, Skills, Domains and Locations pages, loaded only while Thai is shown).
 */
export function useLocalize() {
  const lang = useLanguage();
  const names = useEntriesBySection(lang === 'en' ? [] : [ORGANIZATIONS, SKILLS, DOMAIN_LIST, LOCATION_LIST]);
  const registry = { organizations: names.get(ORGANIZATIONS), skills: names.get(SKILLS), domains: names.get(DOMAIN_LIST), locations: names.get(LOCATION_LIST) };
  return <T extends Record<string, string>>(section: SectionDef, entry: T): T => localizeEntry(section, entry, lang, registry);
}

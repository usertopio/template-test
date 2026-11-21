import { orgKey, suggestionSections, translationKey, type SectionDef } from '@profile/shared';
import type { Repos } from './repo';

/**
 * A suggested value saved with its Thai (an activity's domain Engineering = วิศวกรรม): give the same Thai to every
 * other entry with that value and no Thai yet, so it's typed once. Thai already given elsewhere is left alone.
 */
export async function fillSuggestionThai(repos: Repos, section: SectionDef, entry: Record<string, string>) {
  for (const field of section.fields.filter((f) => f.suggestions?.length && f.translatable)) {
    const thKey = translationKey(field.key, 'th');
    const en = orgKey(entry[field.key]);
    const th = entry[thKey]?.trim();
    if (!en || !th) continue;
    for (const { section: other } of suggestionSections(field)) {
      const repo = repos.get(other.key)!;
      for (const e of await repo.list()) {
        if (e.id !== entry.id && orgKey(e[field.key]) === en && !e[thKey]?.trim()) await repo.update(e.id, { [thKey]: th });
      }
    }
  }
}

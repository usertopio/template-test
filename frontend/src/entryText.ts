import { getSection, progressLabel, progressOf, splitLinks, splitList, type Entry, type FieldDef, type Language, type SectionDef } from '@profile/shared';

/** The fields filled in on an entry, in form order (unticked boxes left out; a progress once its dates tell one). */
export const filledFields = (section: SectionDef, entry: Entry) =>
  section.fields.filter((f) => (f.type === 'boolean' ? entry[f.key] === 'true' : f.progress ? !!progressOf(entry) : !!entry[f.key]?.trim()));

/**
 * A stored date as it is shown: 'YYYY-MM-DD' as dd/mm/yy, 'YYYY-MM' as mm/yy. The sheet keeps the ISO form, so it
 * still sorts and can be typed by hand; anything else (edited by hand into another shape) is shown as it is.
 */
export function formatDate(value: string): string {
  const m = /^\d{2}(\d{2})-(\d{2})(?:-(\d{2}))?$/.exec(value.trim());
  if (!m) return value;
  const [, yy, mm, dd] = m;
  return dd ? `${dd}/${mm}/${yy}` : `${mm}/${yy}`;
}

/**
 * A field's value as text: linked entries by name, ticked boxes as "Yes", tags as a comma list, dates as dd/mm/yy.
 * `lang`: the language `entry` is shown in, for the one fixed choice with a Thai name (a progress).
 */
export function fieldText(field: FieldDef, entry: Entry, related: Map<string, Entry[]>, lang: Language = 'en'): string {
  const value = entry[field.key] ?? '';
  if (field.type === 'boolean') return value === 'true' ? 'Yes' : 'No';
  if (field.progress) {
    const progress = progressOf(entry);
    return progress && progressLabel(progress, lang);
  }
  if (field.type === 'date') return formatDate(value);
  if (field.type === 'tags') return splitList(value).join(', ');
  // A link per line, its title first, so a copied or exported entry keeps both.
  if (field.type === 'links') {
    return splitLinks(value)
      .map((l) => (l.title ? `${l.title}: ${l.url}` : l.url) + (l.email ? ` (signed up with ${l.email})` : ''))
      .join('\n');
  }
  // Picked files are named on the card; as text, how many there are.
  if (field.type === 'media') {
    const n = splitList(value).length;
    return n ? `${n} ${n === 1 ? 'file' : 'files'}` : '';
  }
  if (field.type === 'refs') {
    const target = getSection(field.refSection!)!;
    const byId = new Map((related.get(target.key) ?? []).map((e) => [e.id, e]));
    return splitList(value)
      .flatMap((id) => (byId.has(id) ? [byId.get(id)![target.titleField] || '(untitled)'] : []))
      .join(', ');
  }
  return value.trim();
}

/** The whole entry as text: "Label: value" per filled field, long text on its own lines. */
export function entryText(section: SectionDef, entry: Entry, related: Map<string, Entry[]>, lang: Language = 'en'): string {
  return filledFields(section, entry)
    .map((f) => ({ f, text: fieldText(f, entry, related, lang) }))
    .filter(({ text }) => text)
    .map(({ f, text }) => (f.type === 'textarea' || f.type === 'links' ? `${f.label}:\n${text}` : `${f.label}: ${text}`))
    .join('\n');
}

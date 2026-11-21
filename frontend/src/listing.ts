// Sort and filter options for list sections, derived from the section config.
import { CREDENTIALS_GROUP, PROGRESS, getSection, signUpEmails, hasImageSlots, isDraft, linkedFromFields, localizeEntry, orgKey, progressOf, splitList, splitOrganizations, translationColumns, untranslatedFields, type Entry, type FieldDef, type Language, type MediaItem, type SectionDef } from '@profile/shared';

export type SortDir = 'asc' | 'desc';

const BY_DATE: Record<SortDir, string> = { desc: 'Newest first', asc: 'Oldest first' };

export interface SortOption {
  id: string;
  label: string;
  defaultDir: SortDir;
  /** Each direction in words that fit what's sorted ("Newest first", "A to Z"), rather than an arrow to puzzle out. */
  dirLabels: Record<SortDir, string>;
  /** Sort value; null/'' always sorts last regardless of direction. */
  value: (e: Entry) => string | number | null;
}

/**
 * Where a filter sits in the tools panel, in this order: what it's about (category, domain), when, how far along
 * (drafts, posts, Thai), then the rest.
 */
export const FILTER_GROUPS = ['Topic', 'When', 'Progress', 'Details'] as const;
export type FilterGroup = (typeof FILTER_GROUPS)[number];

export interface FilterOption {
  key: string;
  label: string;
  group: FilterGroup;
  /** A few fixed choices, shown as pills; otherwise a dropdown (open-ended lists, like organizers or places). */
  pills: boolean;
  options: { value: string; label: string }[];
  matches: (e: Entry, value: string) => boolean;
}

export interface ListingState {
  q: string;
  sort: string;
  dir: SortDir;
  /** Per filter, the values picked; several are joined by FILTER_SEP, and an entry matching any of them is shown. */
  filters: Record<string, string>;
}

/** Joins a filter's values. A newline can't be typed into the one-line fields filters offer, so no value has one. */
export const FILTER_SEP = '\n';

/** A filter's picked values (none: every entry). */
export const filterValues = (value: string | undefined) => (value ? value.split(FILTER_SEP).filter(Boolean) : []);

/** 'YYYY-MM' or 'YYYY-MM-DD' → epoch ms (null when empty/invalid). */
function toTime(v: string | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v.length === 7 ? `${v}-01` : v);
  return Number.isNaN(t) ? null : t;
}

const hasRange = (s: SectionDef) => s.fields.some((f) => f.key === 'startDate') && s.fields.some((f) => f.key === 'endDate');

/** Start → end (today when there's no end date yet), in days. Unknown for one marked "No end date". */
function durationDays(e: Entry): number | null {
  const start = toTime(e.startDate);
  if (start == null || e.noEndDate === 'true') return null;
  const end = toTime(e.endDate) ?? Date.now();
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

/** `lang`: names sort as they are shown, in that language. */
export function sortOptions(section: SectionDef, lang: Language = 'en'): SortOption[] {
  const title = section.fields.find((f) => f.key === section.titleField);
  const options: SortOption[] = [];
  for (const f of section.fields.filter((f) => f.type === 'date')) {
    options.push({ id: f.key, label: f.label, defaultDir: 'desc', dirLabels: BY_DATE, value: (e) => e[f.key] || null });
  }
  if (hasRange(section)) options.push({ id: 'duration', label: 'Duration', defaultDir: 'desc', dirLabels: { desc: 'Longest first', asc: 'Shortest first' }, value: durationDays });
  options.push(
    { id: 'title', label: title?.label ?? 'Name', defaultDir: 'asc', dirLabels: { asc: 'A to Z', desc: 'Z to A' }, value: (e) => (localizeEntry(section, e, lang)[section.titleField] ?? '').toLowerCase() || null },
    { id: 'createdAt', label: 'Date added', defaultDir: 'desc', dirLabels: BY_DATE, value: (e) => e.createdAt || null },
    { id: 'updatedAt', label: 'Last updated', defaultDir: 'desc', dirLabels: BY_DATE, value: (e) => e.updatedAt || null },
  );
  return options;
}

export function defaultSort(section: SectionDef, lang: Language = 'en'): SortOption {
  const options = sortOptions(section, lang);
  const firstDate = section.fields.find((f) => f.type === 'date');
  const id = section.defaultSort ?? firstDate?.key ?? 'title';
  return options.find((o) => o.id === id) ?? options[0];
}

const cellValue = (e: Entry, f: FieldDef) => e[f.key] || f.default || '';
/** "a post", "an activity". */
const withArticle = (noun: string) => `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;

/**
 * Entries of other sections that link to this section's entries and whose links its filters can ask about
 * (linkedFromFields, e.g. posts linking an activity), by section key.
 */
export type Linkers = Map<string, Entry[]>;

/** Filters offered for a section, with choices taken from the current entries (and their `media`) where relevant. */
export function filterOptions(section: SectionDef, entries: Entry[], linkers: Linkers = new Map(), media: MediaItem[] = []): FilterOption[] {
  const out: FilterOption[] = [];

  if (section.drafts && entries.some(isDraft)) {
    out.push({
      key: 'status',
      group: 'Progress',
      pills: true,
      label: 'Status',
      options: [
        { value: 'draft', label: 'Drafts' },
        { value: 'saved', label: 'Saved' },
      ],
      matches: (e, v) => isDraft(e) === (v === 'draft'),
    });
  }

  for (const f of section.fields) {
    if (f.progress) {
      // Most of it follows from the dates, so the choices are the ones entries have, not just those stored.
      const used = PROGRESS.filter((p) => entries.some((e) => progressOf(e) === p));
      if (used.length) {
        out.push({
          key: f.key,
          group: 'Progress',
          pills: true,
          label: f.label,
          options: used.map((p) => ({ value: p, label: p })),
          matches: (e, v) => progressOf(e) === v,
        });
      }
    } else if (f.type === 'select') {
      out.push({
        key: f.key,
        group: 'Details',
        pills: true,
        label: f.label,
        options: f.options!.map((o) => ({ value: o, label: o[0].toUpperCase() + o.slice(1) })),
        matches: (e, v) => cellValue(e, f) === v,
      });
    } else if (f.type === 'boolean' && f.key !== 'noExpiryDate') {
      // "No expiration date" isn't a filter of its own: Expiration (below) offers it.
      out.push({
        key: f.key,
        // Online is about where, not when.
        group: f.key === 'online' ? 'Details' : 'When',
        pills: true,
        label: f.key === 'current' ? 'Current' : f.label,
        options: [
          { value: 'true', label: 'Yes' },
          { value: 'false', label: 'No' },
        ],
        matches: (e, v) => (e[f.key] === 'true') === (v === 'true'),
      });
    } else if (f.organization) {
      // Each organization once, so an entry with several shows under each of them.
      const used = uniqueTags(entries.flatMap((e) => splitOrganizations(e[f.key])));
      if (used.length) {
        out.push({
          key: f.key,
          group: 'Details',
          pills: false,
          label: f.label,
          options: used.map((t) => ({ value: orgKey(t), label: t })),
          matches: (e, v) => splitOrganizations(e[f.key]).some((n) => orgKey(n) === v),
        });
      }
    } else if (f.suggestions || f.filter) {
      // Only the values in use, so a category nobody picked doesn't offer an empty list. Matched like
      // organization names (ignoring case and extra spaces), since the cells are typed by hand. An entry with
      // several (domains) shows under each.
      const values = (e: Entry) => (f.type === 'tags' ? splitList(e[f.key]) : [e[f.key]?.trim() ?? '']).map((v) => v.replace(/\s+/g, ' ')).filter(Boolean);
      const used = uniqueTags(entries.flatMap(values));
      if (used.length) {
        out.push({
          key: f.key,
          group: f.suggestions ? 'Topic' : 'Details',
          pills: !!f.suggestions,
          label: f.label,
          options: used.map((t) => ({ value: orgKey(t), label: t })),
          matches: (e, v) => values(e).some((n) => orgKey(n) === v),
        });
      }
    } else if (f.type === 'tags') {
      const tags = uniqueTags(entries.flatMap((e) => splitList(e[f.key])));
      if (tags.length) {
        out.push({
          key: f.key,
          group: 'Details',
          pills: false,
          label: f.label,
          options: tags.map((t) => ({ value: t.toLowerCase(), label: t })),
          matches: (e, v) => splitList(e[f.key]).some((t) => t.toLowerCase() === v),
        });
      }
    }
  }

  // Certifications and certificates: a filter each (once some entry has one), for the entries that have one, or don't
  // yet. Only an entry's own Certifications & certificates box: a post's links to them stay under Linked.
  const credentials = section.fields.filter((f) => f.type === 'refs' && f.group === CREDENTIALS_GROUP);
  for (const f of credentials) {
    if (!entries.some((e) => splitList(e[f.key]).length)) continue;
    const label = getSection(f.refSection!)!.label;
    out.push({
      key: f.key,
      group: 'Progress',
      pills: true,
      label,
      options: [
        { value: 'has', label: 'Has' },
        { value: 'none', label: "Doesn't have" },
      ],
      matches: (e, v) => (splitList(e[f.key]).length > 0) === (v === 'has'),
    });
  }

  // Media: once some entry has a file, the entries with files and those without. Any file counts (a photo, an agenda,
  // the certificate itself). Not while the files are still loading, when every entry would seem to have none.
  if (section.media && !hasImageSlots(section)) {
    const withFiles = new Set(media.map((m) => m.entryId));
    if (entries.some((e) => withFiles.has(e.id))) {
      out.push({
        key: 'media',
        group: 'Progress',
        pills: true,
        label: 'Media',
        options: [
          { value: 'has', label: 'Has' },
          { value: 'none', label: "Doesn't have" },
        ],
        matches: (e, v) => withFiles.has(e.id) === (v === 'has'),
      });
    }
  }

  // Linked: one filter for the other links (a post's or an activity's entries), by what they link to.
  const refs = section.fields.filter((f) => f.type === 'refs' && !credentials.includes(f) && entries.some((e) => e[f.key]));
  if (refs.length) {
    out.push({
      key: 'linked',
      group: 'Progress',
      pills: true,
      label: 'Linked',
      options: [
        ...refs.map((f) => ({ value: f.key, label: getSection(f.refSection!)?.label ?? f.label })),
        { value: 'none', label: 'Nothing' },
      ],
      matches: (e, v) => {
        const linked = section.fields.filter((f) => f.type === 'refs' && e[f.key]);
        return v === 'none' ? linked.length === 0 : linked.some((f) => f.key === v);
      },
    });
  }

  // Year: entries active in that year for ranged sections (start–end), otherwise by the first date field.
  const firstDate = section.fields.find((f) => f.type === 'date');
  if (firstDate) {
    const ranged = hasRange(section);
    const span = (e: Entry): [number, number] | null => {
      const start = e[ranged ? 'startDate' : firstDate.key]?.slice(0, 4);
      if (!start) return null;
      // No end date = still ongoing, same as durationDays(), unless marked "No end date": its start year only.
      const end = ranged && e.noEndDate !== 'true' ? e.endDate?.slice(0, 4) || String(new Date().getFullYear()) : start;
      return [Number(start), Math.max(Number(start), Number(end))];
    };
    const years = new Set<number>();
    for (const e of entries) {
      const s = span(e);
      if (s) for (let y = s[0]; y <= s[1]; y++) years.add(y);
    }
    if (years.size) {
      out.push({
        key: 'year',
        group: 'When',
        pills: true,
        label: 'Year',
        options: [...years].sort((a, b) => b - a).map((y) => ({ value: String(y), label: String(y) })),
        matches: (e, v) => {
          const s = span(e);
          return !!s && s[0] <= Number(v) && Number(v) <= s[1];
        },
      });
    }
  }

  // Posts and activities: which entries a post already tells about (or an activity is part of), and which not yet.
  for (const { section: from, field } of linkedFromFields(section.key)) {
    const linking = linkers.get(from.key);
    if (!linking) continue;
    const linked = new Set(linking.flatMap((e) => splitList(e[field.key])));
    out.push({
      key: from.key,
      group: 'Progress',
      pills: true,
      label: from.label,
      options: [
        { value: 'linked', label: `In ${withArticle(from.itemLabel ?? 'entry')}` },
        { value: 'none', label: `Not in ${withArticle(from.itemLabel ?? 'entry')} yet` },
      ],
      matches: (e, v) => linked.has(e.id) === (v === 'linked'),
    });
  }

  if (section.fields.some((f) => f.key === 'expiryDate') && entries.some((e) => e.expiryDate || e.noExpiryDate === 'true')) {
    const expired = (d: string) => d < new Date().toISOString().slice(0, d.length); // valid through the expiry date itself
    out.push({
      key: 'expiry',
      group: 'When',
      pills: true,
      label: 'Expiration',
      options: [
        { value: 'valid', label: 'Still valid' },
        { value: 'expired', label: 'Expired' },
        { value: 'none', label: 'No expiration' },
      ],
      matches: (e, v) => (e.expiryDate ? (expired(e.expiryDate) ? 'expired' : 'valid') : 'none') === v,
    });
  }

  // Organizations: which of their sites you've noted the email signed up with. One with no sites matches neither.
  if (section.fields.some((f) => f.accountEmail || f.accountFor) && entries.some((e) => signUpEmails(section, e).sites)) {
    out.push({
      key: 'signUpEmail',
      group: 'Details',
      pills: true,
      label: 'Sign-up email',
      options: [
        { value: 'has', label: 'Has a sign-up email' },
        { value: 'none', label: 'No sign-up email yet' },
      ],
      matches: (e, v) => {
        const { sites, emails } = signUpEmails(section, e);
        return v === 'has' ? emails > 0 : sites > 0 && emails === 0;
      },
    });
  }

  // Thai: which entries still need a translation (English text in a translatable field with no Thai yet).
  const translatable = section.fields.filter((f) => f.translatable);
  if (entries.some((e) => translatable.some((f) => e[f.key]?.trim()))) {
    out.push({
      key: 'thai',
      group: 'Progress',
      pills: true,
      label: 'Thai',
      options: [
        { value: 'missing', label: 'Needs translation' },
        { value: 'done', label: 'Translated' },
      ],
      matches: (e, v) => (untranslatedFields(section, e, 'th').length > 0) === (v === 'missing'),
    });
  }

  return out;
}

/** Every field's text, in English and Thai, so a search finds an entry by either. */
function searchText(section: SectionDef, e: Entry): string {
  return [...section.fields.filter((f) => f.type !== 'refs' && f.type !== 'media').map((f) => f.key), ...translationColumns(section)]
    .map((key) => e[key] ?? '')
    .join(' ')
    .toLowerCase();
}

/**
 * The value of `f`'s filter that picks the entries with `value` (one item, for a list field), or null where the
 * field has no filter. Clicking a value on a card applies it. Keep in step with filterOptions.
 */
export function filterValueOf(f: FieldDef, value: string): string | null {
  if (!value.trim()) return null;
  if (f.progress || f.type === 'select' || f.type === 'boolean') return value;
  if (f.organization) return orgKey(value);
  if (f.suggestions || f.filter) return orgKey(value.replace(/\s+/g, ' '));
  if (f.type === 'tags') return value.toLowerCase();
  return null;
}

/** Apply search, filters and sort. */
export function applyListing(section: SectionDef, entries: Entry[], state: ListingState, lang: Language = 'en', linkers: Linkers = new Map(), media: MediaItem[] = []): Entry[] {
  const filters = filterOptions(section, entries, linkers, media);
  const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  const sort = sortOptions(section, lang).find((o) => o.id === state.sort) ?? defaultSort(section, lang);
  const sign = state.dir === 'asc' ? 1 : -1;

  return entries
    .filter((e) => {
      if (terms.length) {
        const text = searchText(section, e);
        if (!terms.every((t) => text.includes(t))) return false;
      }
      // Values of one filter widen it (Engineering or Film); different filters narrow each other.
      return filters.every((f) => {
        const values = filterValues(state.filters[f.key]);
        return !values.length || values.some((v) => f.matches(e, v));
      });
    })
    .map((e) => ({ e, v: sort.value(e) }))
    .sort((a, b) => {
      const aEmpty = a.v == null || a.v === '';
      const bEmpty = b.v == null || b.v === '';
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1; // empties last
      const cmp = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v));
      return cmp * sign;
    })
    .map(({ e }) => e);
}

/** Tags unique case-insensitively (first spelling wins), sorted. */
export function uniqueTags(tags: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const t of tags) if (!byKey.has(t.toLowerCase())) byKey.set(t.toLowerCase(), t);
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

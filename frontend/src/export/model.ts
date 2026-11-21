// What an export contains, whatever its format: every filled-in field and every chosen media file of the
// entries, in one or both languages. The Word, Excel and PDF writers only lay this out.
import {
  DETAIL_FILES,
  LANGUAGE_NAMES,
  getSection,
  isDraft,
  localizeEntry,
  mediaBlock,
  mediaDescription,
  mediaKind,
  mediaOf,
  type Entry,
  type Language,
  type MediaItem,
  type MediaKind,
  type NameEntries,
  type SectionDef,
} from '@profile/shared';
import { zipPaths } from '../download';
import { fieldText, filledFields } from '../entryText';

export type ExportFormat = 'docx' | 'xlsx' | 'pdf';
export type ExportLanguage = Language | 'both';

export const FORMATS: Record<ExportFormat, { label: string; ext: string; mime: string }> = {
  docx: { label: 'Word', ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xlsx: { label: 'Excel', ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pdf: { label: 'PDF', ext: 'pdf', mime: 'application/pdf' },
};

/** Entries of one section to export; `mediaIds` limits their files (all of them when left out). */
export interface ExportPart {
  section: SectionDef;
  entries: Entry[];
  mediaIds?: string[];
}

export interface ExportField {
  /** Stable per field and language, e.g. "title" or "title:th" (Excel's columns). */
  key: string;
  /** "Description", or "Description (ไทย)" for the Thai text when both languages are exported. */
  label: string;
  text: string;
  /** Long text (a textarea): its own lines in Word and PDF. */
  long: boolean;
}

export interface ExportFile {
  item: MediaItem;
  /** The description in each exported language (once when they're the same, none when there isn't one). */
  descriptions: string[];
  kind: MediaKind;
  /** "Certificate file" or "Media" on credentials; empty elsewhere. */
  group: string;
  /** Where the original is inside the export's .zip, when files are included. */
  path?: string;
}

export interface ExportEntry {
  id: string;
  /** The title in each exported language (once when they're the same). */
  titles: string[];
  draft: boolean;
  fields: ExportField[];
  files: ExportFile[];
}

export interface ExportSection {
  section: SectionDef;
  entries: ExportEntry[];
}

export interface ExportDoc {
  title: string;
  languages: Language[];
  sections: ExportSection[];
  /** "2 October 2026", in the first exported language. */
  date: string;
}

/** What the model needs besides the entries: linked entries by section, media, and Thai names. */
export interface ExportData {
  related: Map<string, Entry[]>;
  media: MediaItem[];
  names: NameEntries;
}

export const languagesOf = (lang: ExportLanguage): Language[] => (lang === 'both' ? ['en', 'th'] : [lang]);

/** Sections an export of `parts` reads besides their own: the ones they link to. */
export function relatedSections(parts: ExportPart[]): string[] {
  return [...new Set(parts.flatMap((p) => p.section.fields.filter((f) => f.type === 'refs').map((f) => f.refSection!)))];
}

/** The media of `parts` that go in the export, with their paths inside the zip (in folders like Drive's). */
export function exportFiles(parts: ExportPart[], media: MediaItem[]): { path: string; item: MediaItem }[] {
  return parts.flatMap(({ section, entries, mediaIds }) => {
    const chosen = media.filter((m) => !mediaIds || mediaIds.includes(m.id));
    // One section: its entries' folders at the top of media/; several: a folder per section first, like Drive.
    const prefix = parts.length > 1 ? `media/${section.tab}/` : 'media/';
    return zipPaths(section, entries, chosen, { folders: true }).map(({ path, item }) => ({ path: prefix + path, item }));
  });
}

/** The order of an entry's file blocks, as on the card: the certificate itself, detail files, then media. */
const BLOCK_ORDER = ['credential', 'detail', 'media'];

/**
 * What a file is, said in its note: "Certificate file", "Detail files" or "Media" when the entry has several kinds
 * (as its card labels them), nothing when it only has media.
 */
function fileGroup(section: SectionDef, item: MediaItem, own: MediaItem[]): string {
  const credential = section.media?.credential;
  if (!credential && !own.some((m) => mediaBlock(section, m) === 'detail')) return '';
  const block = mediaBlock(section, item);
  return block === 'credential' ? credential!.label : block === 'detail' ? DETAIL_FILES : 'Media';
}

export function buildExport(title: string, parts: ExportPart[], lang: ExportLanguage, data: ExportData, { includeFiles = false } = {}): ExportDoc {
  const languages = languagesOf(lang);
  const paths = new Map(includeFiles ? exportFiles(parts, data.media).map((f) => [f.item.id, f.path]) : []);
  const relatedIn = new Map(
    languages.map((l) => [l, new Map([...data.related].map(([key, entries]) => [key, entries.map((e) => localizeEntry(getSection(key)!, e, l, data.names))]))]),
  );

  const sections = parts.map(({ section, entries, mediaIds }) => ({
    section,
    entries: entries.map((entry): ExportEntry => {
      const shown = languages.map((l) => ({ lang: l, entry: localizeEntry(section, entry, l, data.names), related: relatedIn.get(l)! }));
      const fields: ExportField[] = [];
      for (const field of section.fields) {
        if (field.key === section.titleField) continue;
        const texts = shown.map((s) => ({
          lang: s.lang,
          text: filledFields(section, s.entry).includes(field) ? fieldText(field, s.entry, s.related, s.lang) : '',
        }));
        // The same in both languages (a date, an untranslated field): once, without a language.
        const distinct = texts.filter((t, i) => t.text && texts.findIndex((u) => u.text === t.text) === i);
        for (const { lang: l, text } of distinct) {
          const tagged = distinct.length > 1 && l !== 'en';
          fields.push({ key: tagged ? `${field.key}:${l}` : field.key, label: tagged ? `${field.label} (${LANGUAGE_NAMES[l]})` : field.label, text, long: field.type === 'textarea' || field.type === 'links' });
        }
      }
      const own = mediaOf(data.media, entry.id);
      const files = own
        .filter((m) => !mediaIds || mediaIds.includes(m.id))
        .map((item) => ({
          item,
          descriptions: [...new Set(languages.map((l) => mediaDescription(item, l)).filter(Boolean))],
          kind: mediaKind(item.mimeType),
          group: fileGroup(section, item, own),
          path: paths.get(item.id),
        }));
      // Credential files first, then detail files, then media, as on the card.
      files.sort((a, b) => BLOCK_ORDER.indexOf(mediaBlock(section, a.item)) - BLOCK_ORDER.indexOf(mediaBlock(section, b.item)));
      return {
        id: entry.id,
        titles: [...new Set(shown.map((s) => s.entry[section.titleField] || '(untitled)'))],
        draft: isDraft(entry),
        fields,
        files,
      };
    }),
  }));

  return {
    title,
    languages,
    sections,
    date: new Date().toLocaleDateString(languages[0] === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

/** A file's name for an export: no characters file systems dislike. */
export const exportFileName = (title: string) => title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Export';

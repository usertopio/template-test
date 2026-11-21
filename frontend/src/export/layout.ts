// Pieces shared by the Word, Excel and PDF writers.
import type { Language, SectionDef } from '@profile/shared';
import type { ExportImage } from './images';
import type { ExportDoc, ExportEntry, ExportField, ExportFile } from './model';

/** Lays out an export as one document; `images` holds the embeddable images by media id. */
export type Writer = (doc: ExportDoc, images: Map<string, ExportImage>) => Promise<Blob>;

const KIND_NAMES = { image: 'Image', video: 'Video', pdf: 'PDF', text: 'Text' } as const;

/** "Certificate file · PDF · media/AWS/Certification_AWS_Me.pdf": what the file is and where to find it. */
export const fileNote = (file: ExportFile) => [file.group, KIND_NAMES[file.kind], file.path ?? file.item.fileName].filter(Boolean).join(' · ');

export const sectionHeading = (section: SectionDef, _languages: Language[]) => section.label;

/** Sheet names: at most 31 characters, none of []:*?/\, unique. */
export function sheetName(name: string, taken: Set<string>) {
  const base = name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet';
  let candidate = base;
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) candidate = `${base.slice(0, 28)} ${i}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

export interface SheetColumn {
  header: string;
  key: string;
  /** In characters, as Excel measures columns. */
  width: number;
}

/**
 * A section's sheet in the Excel export: the title, then a column per field filled in on any entry, in form order
 * (Thai columns right after their English one), then the number of files and whether it's a draft.
 */
export function sheetColumns(section: SectionDef, entries: ExportEntry[]): SheetColumn[] {
  const columns = new Map<string, ExportField>();
  for (const e of entries) for (const f of e.fields) if (!columns.has(f.key)) columns.set(f.key, f);
  const order = section.fields.flatMap((f) => [...columns.values()].filter((c) => c.key === f.key || c.key.startsWith(`${f.key}:`)));
  const titleLabel = section.fields.find((f) => f.key === section.titleField)?.label ?? 'Title';
  return [
    { header: titleLabel, key: '_title', width: 30 },
    ...order.map((c) => ({ header: c.label, key: c.key, width: c.long ? 60 : 24 })),
    ...(entries.some((e) => e.files.length) ? [{ header: 'Media files', key: '_files', width: 12 }] : []),
    ...(entries.some((e) => e.draft) ? [{ header: 'Draft', key: '_draft', width: 8 }] : []),
  ];
}

/** An entry's row on its section's sheet, by column key. */
export const sheetRow = (e: ExportEntry): Record<string, string | number> => ({
  _title: e.titles.join(' / '),
  ...Object.fromEntries(e.fields.map((f) => [f.key, f.text])),
  _files: e.files.length || '',
  _draft: e.draft ? 'Yes' : '',
});

export const MEDIA_COLUMNS: SheetColumn[] = [
  { header: 'Preview', key: 'preview', width: 14 },
  { header: 'Section', key: 'section', width: 16 },
  { header: 'Entry', key: 'entry', width: 30 },
  { header: 'Kind', key: 'group', width: 16 },
  { header: 'Title', key: 'title', width: 30 },
  { header: 'Description', key: 'description', width: 50 },
  { header: 'File', key: 'file', width: 50 },
];

/** Every file of the export, one row each on the Media sheet. */
export function mediaRows(doc: ExportDoc) {
  return doc.sections.flatMap(({ section, entries }) =>
    entries.flatMap((entry) =>
      entry.files.map((file) => ({
        file,
        section: section.label,
        entry: entry.titles.join(' / '),
        group: [file.group, file.kind === 'pdf' ? 'PDF' : file.kind[0].toUpperCase() + file.kind.slice(1)].filter(Boolean).join(' · '),
        title: file.item.title,
        description: file.descriptions.join('\n\n'),
      })),
    ),
  );
}

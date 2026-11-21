// Media attached to entries (certificates, screenshots, PDFs), like LinkedIn's "Add media".
// Files live in Google Drive; one row per file in the Media tab describes it.

import { META_COLUMNS, type Entry, type Language, type SectionDef } from './sections';

/** Key of the Media tab's repository (it isn't a section: no page, no generic routes). */
export const MEDIA = 'media';
export const MEDIA_TAB = 'Media';
export const MEDIA_TITLE_MAX = 100;
export const MEDIA_DESCRIPTION_MAX = 500;
/**
 * Largest file sent in one request, through the server and the media script. Apps Script takes about 50 MB per
 * call, as base64 (a third bigger), so anything larger goes to Drive in pieces (see uploadsInPieces). Text files,
 * profile photos, backgrounds and logos are kept to this.
 */
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
/** Largest image or PDF; over MEDIA_MAX_BYTES it uploads in pieces, like a video. */
export const IMAGE_MAX_BYTES = 100 * 1024 * 1024;
/** Largest video; videos upload in pieces straight to Drive. */
export const VIDEO_MAX_BYTES = 500 * 1024 * 1024;
/** Size of each piece of a large upload (a multiple of 256 KB, as Drive requires). */
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

/** Accepted file types and the extension each is saved with. */
export const MEDIA_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  // Detail files only (see DETAIL_FILES).
  'text/plain': 'txt',
} as const;
export type MediaMimeType = keyof typeof MEDIA_TYPES;
export type MediaKind = 'image' | 'video' | 'pdf' | 'text';

export const isMediaType = (mime: string): mime is MediaMimeType => mime in MEDIA_TYPES;
export const isVideo = (mime: string) => mime.startsWith('video/');

export function mediaKind(mime: string): MediaKind {
  return mime === 'application/pdf' ? 'pdf' : mime === 'text/plain' ? 'text' : isVideo(mime) ? 'video' : 'image';
}

/** A file's format as shown on it, e.g. "PNG" or "TXT" (from the file name for a type we don't know). */
export const formatLabel = (mime: string, fileName = '') =>
  (isMediaType(mime) ? MEDIA_TYPES[mime] : fileName.includes('.') ? fileName.split('.').pop()! : '').toUpperCase() || 'File';

/** Size limit for a file type. */
export const maxBytesFor = (mime: string) => (isVideo(mime) ? VIDEO_MAX_BYTES : mime === 'text/plain' ? MEDIA_MAX_BYTES : IMAGE_MAX_BYTES);

/** Whether a file goes to Drive in pieces rather than in one request: every video, and anything too big for one. */
export const uploadsInPieces = (mime: string, size: number) => isVideo(mime) || size > MEDIA_MAX_BYTES;

/** Type from a file name, for browsers that leave File.type empty (e.g. some .mov files). */
export function mimeFromName(name: string): MediaMimeType | undefined {
  const ext = name.split('.').pop()?.toLowerCase();
  const byExt: Record<string, MediaMimeType> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', txt: 'text/plain' };
  return ext ? byExt[ext] : undefined;
}

export const MEDIA_COLUMNS = [
  ...META_COLUMNS,
  'section',
  'entryId',
  'title',
  'description',
  'position',
  'fileName',
  'mimeType',
  'size',
  'fileId',
  'folderId',
  /** Entries linking to this one, as text, e.g. "Projects: Film · Volunteer: Camera - Red Cross". */
  'linkedTo',
  /** JSON list of the Drive shortcuts to this file in those entries' folders. */
  'shortcuts',
  /** On credentials: 'credential' for the certificate file itself, 'media' for anything else. */
  'role',
  /** The description in Thai; empty means the same as English. The title stays as is: it names the file. */
  'description_th',
] as const;

/** A row of the Media tab. */
export type MediaItem = Entry & Record<(typeof MEDIA_COLUMNS)[number], string>;

// Drive opens these for the owner (and anyone the folder is shared with); others get Drive's "request access" page.
/** A file in Google Drive, from its row. '' without a Drive file id. */
export const driveFileUrl = (item: { fileId?: string }) => (item.fileId ? `https://drive.google.com/file/d/${item.fileId}/view` : '');
/** A folder in Google Drive. '' without a folder id. */
export const driveFolderUrl = (folderId?: string) => (folderId ? `https://drive.google.com/drive/folders/${folderId}` : '');


/** One part of a file name: no characters Drive or desktops dislike, spaces as dashes, no "_" (it separates the parts). */
function namePart(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|_]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

/** "<Section>_<Title>_<Owner>.<ext>", e.g. "Project_AWS-Certificate_Tammasorn.png". */
export function mediaFileName(prefix: string, title: string, owner: string, ext: string): string {
  return [prefix, title || 'Media', owner].map(namePart).filter(Boolean).join('_') + `.${ext}`;
}

/** Add "_2", "_3", … before the extension until the name isn't in `taken` (compared ignoring case). */
export function uniqueFileName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  const dot = name.lastIndexOf('.');
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  let candidate = name;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base}_${i}${ext}`;
  return candidate;
}

/** Drive folder for an entry's media: its title plus the first subtitle field, e.g. "Software Engineer - Depa". */
export function entryFolderName(section: SectionDef, entry: Record<string, string>): string {
  const subtitle = section.media?.plain ? undefined : section.subtitleFields?.[0];
  const parts = [section.titleField, subtitle].map((k) => (k ? entry[k]?.trim() : '')).filter(Boolean);
  return parts.join(' - ') || '(untitled)';
}

export type MediaRole = 'credential' | 'detail' | 'media' | 'photo' | 'banner' | 'logo';

/**
 * Detail files: what details an entry (an event's agenda, a brochure, a course outline), kept apart from its media
 * (photos, videos) and, on a credential, from the certificate itself. JPG, PNG or PDF, like a certificate file, or
 * a plain text file (notes, which can also be written in the form). Text is allowed only here.
 */
export const DETAIL_FILES = 'Detail files';
export const DETAIL_SUBFOLDER = 'Details';

/** The About page's images (see MediaConfig.profile): their names and LinkedIn's recommended sizes. */
export const PROFILE_IMAGES = {
  photo: { title: 'Profile photo', size: '400 × 400' },
  banner: { title: 'Background photo', size: '1584 × 396' },
} as const;
export type ProfileImage = keyof typeof PROFILE_IMAGES;

/**
 * Whether a file is a credential's own file (certificate scan) rather than other media. On credential
 * sections everything except role 'media' counts, so files from before roles existed stay certificate files.
 */
export function isCredentialFile(section: SectionDef | undefined, item: { role?: string }): boolean {
  return !!section?.media?.credential && item.role !== 'media' && item.role !== 'detail';
}

/** Which block of an entry's files a file (or a role) is in: a credential's own file, the detail files, or the media. */
export type MediaBlock = 'credential' | 'detail' | 'media';
export function mediaBlock(section: SectionDef | undefined, item: { role?: string }): MediaBlock {
  if (item.role === 'detail') return 'detail';
  return isCredentialFile(section, item) ? 'credential' : 'media';
}

/**
 * Sections whose files are set images rather than a media list (About's photos, an organization's logo): JPG or
 * PNG only, one per role, and a new one replaces the old.
 */
export const hasImageSlots = (section: SectionDef | undefined) => !!(section?.media?.profile || section?.media?.logo);

/** An organization's logo, if it has one (see MediaConfig.logo). */
export const logoOf = (media: MediaItem[], organizationId: string | undefined) =>
  organizationId ? media.find((m) => m.entryId === organizationId && m.role === 'logo') : undefined;

/**
 * The role to store for an upload: About's images and logos have theirs; any other section can take detail files;
 * credentials default to their own file. Other media have no role (as files from before roles existed).
 */
export function mediaRole(section: SectionDef, requested: unknown): MediaRole | '' {
  if (section.media?.profile) return requested === 'banner' ? 'banner' : 'photo';
  if (section.media?.logo) return 'logo';
  if (requested === 'detail' && !section.media?.plain) return 'detail';
  if (!section.media?.credential) return '';
  return requested === 'media' ? 'media' : 'credential';
}

/** Subfolder of the entry folder for a file: detail files go in "Details", other media of a credential in "Media". */
export const MEDIA_SUBFOLDER = 'Media';
export const roleSubfolder = (section: SectionDef, role: string) =>
  role === 'detail' ? [DETAIL_SUBFOLDER] : section.media?.credential && role === 'media' ? [MEDIA_SUBFOLDER] : [];

/** File-name prefix and top Drive folder for an entry's media. */
export function mediaNaming(section: SectionDef, _entry?: Record<string, string>): { prefix: string; folder: string } {
  return { prefix: section.media!.prefix, folder: section.media!.folder ?? section.tab };
}

/** A file's description as shown in `lang`: its Thai text where it has one, otherwise the English. */
export function mediaDescription(item: { description: string; description_th?: string }, lang: Language): string {
  return (lang === 'th' && item.description_th?.trim()) || item.description;
}

/** The file's description in Drive: what the user wrote (English, then Thai, so Drive search finds either), then where it's linked. */
export function driveDescription(item: { description: string; description_th?: string }, linkedTo: string): string {
  return [item.description, item.description_th, linkedTo && `Linked to: ${linkedTo}`].filter(Boolean).join('\n\n');
}

/** Media of one entry, in display order. */
export function mediaOf(items: MediaItem[], entryId: string): MediaItem[] {
  return items.filter((m) => m.entryId === entryId).sort((a, b) => Number(a.position) - Number(b.position) || a.createdAt.localeCompare(b.createdAt));
}

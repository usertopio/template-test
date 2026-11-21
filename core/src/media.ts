import {
  MEDIA,
  MEDIA_TYPES,
  entryFolderName,
  getSection,
  mediaFileName,
  mediaNaming,
  mediaBlock,
  roleSubfolder,
  type MediaRole,
  driveDescription,
  mediaOf,
  uniqueFileName,
  type Entry,
  type MediaItem,
  type MediaMimeType,
  type SectionDef,
} from '@profile/shared';
import { HttpError, describeError } from './errors';
import type { FileStore, FileStoreProvider } from './files';
import type { Repos } from './repo';

const mediaRepo = (repos: Repos) => repos.get(MEDIA)!;

/** A Drive shortcut to a media file, in the folder of an entry that links to it. */
export interface Shortcut {
  /** "<section>:<entry id>" of the linking entry. */
  entry: string;
  id: string;
  folderId: string;
  /** Folder path it was put in, to notice when the entry's folder is renamed. */
  path: string;
  name: string;
  /** The linking entry's folder (the shortcut sits in a subfolder of it), to tidy up when emptied. */
  parentId?: string;
}

export function shortcutsOf(item: MediaItem): Shortcut[] {
  try {
    return item.shortcuts ? (JSON.parse(item.shortcuts) as Shortcut[]) : [];
  } catch {
    return []; // edited by hand in the sheet
  }
}

async function trashShortcuts(files: FileStore, item: MediaItem) {
  for (const s of shortcutsOf(item)) {
    await files.trash(s.id);
    await files.trashFolderIfEmpty(s.folderId);
    if (s.parentId) await files.trashFolderIfEmpty(s.parentId);
  }
}

export async function listMedia(repos: Repos): Promise<MediaItem[]> {
  return (await mediaRepo(repos).list()) as MediaItem[];
}

/** A section that accepts media, or a 400. */
export function mediaSection(key: string): SectionDef {
  const section = getSection(key);
  if (!section?.media) throw new HttpError(400, 'Validation failed', { section: `"${key}" doesn't accept media` });
  return section;
}

/** File names already used in a folder, except by `exceptId`. */
const namesIn = (items: MediaItem[], folderId: string, exceptId?: string) => items.filter((m) => m.folderId === folderId && m.id !== exceptId).map((m) => m.fileName);

/** `owner` ends every file name, e.g. "Tammasorn". */
const fileName = (prefix: string, title: string, mimeType: string, owner: string) => mediaFileName(prefix, title, owner, MEDIA_TYPES[mimeType as MediaMimeType]);

/** Drive path of an entry's folder, e.g. ["Certificates", "Data Analytics - Google"]. */
export const entryPath = (section: SectionDef, entry: Record<string, string>) => [mediaNaming(section, entry).folder, entryFolderName(section, entry)];

/** Where a new file goes and what it's called; the row is saved once the file is stored. */
export interface MediaPlan {
  section: string;
  entryId: string;
  title: string;
  description: string;
  description_th: string;
  mimeType: MediaMimeType;
  folderId: string;
  fileName: string;
  position: string;
  role: MediaRole | '';
}

/** Files of an entry in the same block as `role` (see mediaBlock): the credential file(s), the detail files, or the media. */
const sameRole = (section: SectionDef, items: MediaItem[], role: string) => items.filter((m) => mediaBlock(section, m) === mediaBlock(section, { role }));

export async function planMedia(
  repos: Repos,
  files: FileStore,
  input: { section: string; entryId: string; title: string; description: string; description_th?: string; mimeType: MediaMimeType; owner: string; role?: MediaRole | '' },
): Promise<MediaPlan> {
  const section = mediaSection(input.section);
  const entry = await repos.get(section.key)!.get(input.entryId);
  const role = input.role ?? '';
  const all = await listMedia(repos);
  const siblings = sameRole(section, mediaOf(all, entry.id), role);
  // Keep an entry's files together, even if its folder was renamed since. Detail files go in Details/, a
  // credential's other media in Media/.
  const folderId = siblings[0]?.folderId || (await files.folder([...entryPath(section, entry), ...roleSubfolder(section, role)]));
  return {
    section: section.key,
    entryId: entry.id,
    title: input.title,
    description: input.description,
    description_th: input.description_th ?? '',
    mimeType: input.mimeType,
    folderId,
    fileName: uniqueFileName(fileName(mediaNaming(section, entry).prefix, input.title, input.mimeType, input.owner), namesIn(all, folderId)),
    position: String(Math.max(-1, ...siblings.map((m) => Number(m.position) || 0)) + 1),
    role,
  };
}

/** Save the row for a file stored as planned; if that fails, the file is trashed so it isn't orphaned. */
export async function recordMedia(repos: Repos, files: FileStore, plan: MediaPlan, fileId: string, size: number): Promise<MediaItem> {
  try {
    return (await mediaRepo(repos).create({ ...plan, size: String(size), fileId })) as MediaItem;
  } catch (err) {
    await files.trash(fileId).catch(() => {});
    throw err;
  }
}

export async function addMedia(
  repos: Repos,
  files: FileStore,
  input: { section: string; entryId: string; title: string; description: string; description_th?: string; mimeType: MediaMimeType; data: Uint8Array; owner: string; role?: MediaRole | '' },
): Promise<MediaItem> {
  const plan = await planMedia(repos, files, input);
  const fileId = await files.upload({ folderId: plan.folderId, name: plan.fileName, mimeType: plan.mimeType, data: input.data, description: driveDescription(plan, '') });
  return recordMedia(repos, files, plan, fileId, input.data.length);
}

/** Change title/descriptions; a new title renames the file. */
export async function updateMedia(
  repos: Repos,
  getFiles: FileStoreProvider,
  id: string,
  changes: { title: string; description: string; description_th: string },
  owner: string,
): Promise<MediaItem> {
  const repo = mediaRepo(repos);
  const item = (await repo.get(id)) as MediaItem;
  let name = item.fileName;
  if (changes.description !== item.description || changes.description_th !== (item.description_th ?? '')) {
    await (await getFiles()).update(item.fileId, { description: driveDescription(changes, item.linkedTo) });
  }
  if (changes.title !== item.title) {
    const section = mediaSection(item.section);
    const { prefix } = mediaNaming(section, await repos.get(section.key)!.get(item.entryId));
    name = uniqueFileName(fileName(prefix, changes.title, item.mimeType, owner), namesIn(await listMedia(repos), item.folderId, id));
    if (name !== item.fileName) await (await getFiles()).update(item.fileId, { name });
  }
  return (await repo.update(id, { ...changes, fileName: name })) as MediaItem;
}

/** Put an entry's media in the order of `ids` (all of its media ids, each once). */
export async function reorderMedia(repos: Repos, entryId: string, ids: string[]): Promise<MediaItem[]> {
  const entryItems = mediaOf(await listMedia(repos), entryId);
  // Each block (a credential's own files, detail files, other media) is ordered on its own; `ids` is one of them.
  const first = entryItems.find((m) => m.id === ids[0]);
  const section = first && getSection(first.section);
  const items = first && section ? sameRole(section, entryItems, first.role) : [];
  const same = ids.length === items.length && new Set(ids).size === ids.length && items.every((m) => ids.includes(m.id));
  if (!same) throw new HttpError(400, "The order must list each of the entry's media once");
  for (const [position, id] of ids.entries()) {
    const item = items.find((m) => m.id === id)!;
    if (Number(item.position) !== position) await mediaRepo(repos).update(id, { position: String(position) });
  }
  return mediaOf(await listMedia(repos), entryId).filter((m) => ids.includes(m.id));
}

export async function deleteMedia(repos: Repos, getFiles: FileStoreProvider, id: string) {
  const repo = mediaRepo(repos);
  const item = (await repo.get(id)) as MediaItem;
  const files = await getFiles();
  await files.trash(item.fileId);
  await trashShortcuts(files, item);
  await repo.remove(id);
  if (!(await listMedia(repos)).some((m) => m.folderId === item.folderId)) await files.trashFolderIfEmpty(item.folderId);
}

/**
 * A new file replacing the entry's other files of its role (About's profile photo or background): trash those,
 * then give the new one the plain name they held (it was numbered "_2" while they were still there).
 */
export async function replaceOlderMedia(repos: Repos, getFiles: FileStoreProvider, item: MediaItem, owner: string): Promise<MediaItem> {
  for (const old of mediaOf(await listMedia(repos), item.entryId)) {
    if (old.id === item.id || old.role !== item.role) continue;
    await deleteMedia(repos, getFiles, old.id).catch((err) => console.error(`[media] could not remove the old ${old.fileName}:`, describeError(err)));
  }
  const { prefix } = mediaNaming(mediaSection(item.section));
  const name = uniqueFileName(fileName(prefix, item.title, item.mimeType, owner), namesIn(await listMedia(repos), item.folderId, item.id));
  if (name === item.fileName) return item;
  await (await getFiles()).update(item.fileId, { name });
  return (await mediaRepo(repos).update(item.id, { fileName: name })) as MediaItem;
}

/** After an entry is deleted: trash its files and remove their rows. Best effort per file. */
export async function removeEntryMedia(repos: Repos, getFiles: FileStoreProvider, entryId: string) {
  const items = mediaOf(await listMedia(repos), entryId);
  if (!items.length) return;
  const repo = mediaRepo(repos);
  const files = await getFiles().catch((err) => {
    console.error('[media] files of a deleted entry were not trashed:', describeError(err));
  });
  for (const item of items) {
    if (files) {
      await files.trash(item.fileId).catch((err) => console.error(`[media] could not trash ${item.fileName}:`, describeError(err)));
      await trashShortcuts(files, item).catch((err) => console.error(`[media] could not trash shortcuts to ${item.fileName}:`, describeError(err)));
    }
    await repo.remove(item.id);
  }
  if (!files) return;
  const remaining = await listMedia(repos);
  for (const folderId of new Set(items.map((m) => m.folderId))) {
    if (!remaining.some((m) => m.folderId === folderId)) await files.trashFolderIfEmpty(folderId).catch(() => {});
  }
}

/**
 * After an entry is saved: keep its media where its fields say. A new title renames the entry folder
 * (its Media subfolder moves with it), or, if another entry shares the folder, moves its files to a new one.
 */
export async function syncEntryMedia(repos: Repos, getFiles: FileStoreProvider, section: SectionDef, before: Entry, after: Entry, owner: string) {
  if (!section.media) return;
  const oldPath = entryPath(section, before);
  const newPath = entryPath(section, after);
  const oldPrefix = mediaNaming(section, before).prefix;
  const { prefix } = mediaNaming(section, after);
  if (oldPath.join('/') === newPath.join('/') && prefix === oldPrefix) return;
  const all = await listMedia(repos);
  const items = mediaOf(all, after.id);
  if (!items.length) return;
  const files = await getFiles();
  const oldFolders = new Set(items.map((m) => m.folderId));
  const shared = all.some((m) => oldFolders.has(m.folderId) && m.entryId !== after.id);

  // Usually: rename the entry folder in place (same top folder, nobody else in it).
  if (oldPath[0] === newPath[0] && prefix === oldPrefix && !shared) {
    // A file right in the entry folder (not in Details/ or Media/) says which folder that is.
    const top = items.find((m) => !roleSubfolder(section, m.role).length);
    const entryFolder = top?.folderId ?? (await files.folder(oldPath));
    return files.renameFolder(entryFolder, newPath[1]);
  }

  // Otherwise move each file to where it belongs now.
  const targets = new Map<string, Promise<string>>();
  const targetOf = (role: string) => {
    const path = [...newPath, ...roleSubfolder(section, role)];
    if (!targets.has(path.join('/'))) targets.set(path.join('/'), files.folder(path));
    return targets.get(path.join('/'))!;
  };
  const taken = new Map<string, string[]>();
  for (const item of items) {
    const folderId = await targetOf(item.role);
    const names = taken.get(folderId) ?? namesIn(all, folderId).filter((n) => !items.some((m) => m.fileName === n && m.folderId === folderId));
    taken.set(folderId, names);
    const base = prefix === oldPrefix ? item.fileName : fileName(prefix, item.title, item.mimeType, owner);
    const newName = uniqueFileName(base, names);
    names.push(newName);
    if (newName !== item.fileName || folderId !== item.folderId) await files.update(item.fileId, { name: newName, folderId });
    await mediaRepo(repos).update(item.id, { folderId, fileName: newName });
  }
  const remaining = await listMedia(repos);
  const newFolders = new Set(await Promise.all(targets.values()));
  for (const old of oldFolders) if (!newFolders.has(old) && !remaining.some((m) => m.folderId === old)) await files.trashFolderIfEmpty(old);
}

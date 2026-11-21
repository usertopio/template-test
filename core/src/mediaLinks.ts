import { MEDIA, SECTIONS, driveDescription, entryFolderName, getSection, isCredentialFile, isDraft, mediaOf, referencingSections, splitList, type Entry, type SectionDef } from '@profile/shared';
import type { FileStoreProvider } from './files';
import { entryPath, listMedia, shortcutsOf, type Shortcut } from './media';
import type { Repos } from './repo';

// Linked media in Drive: when a project (or job, school, volunteer role) links a certification,
// each of the certification's own files (not its other media) gets a shortcut in a Certifications/
// subfolder of the project's folder, and its Drive description lists everything it's linked to.
// Only sections with media folders take part, and only links to credentials: an activity linking a
// project doesn't get shortcuts to all of the project's photos.

/** Whether links to `target` get shortcuts: certifications and certificates. */
const hasLinkedFiles = (target: string) => !!getSection(target)?.media?.credential;

/** Sections with media folders whose refs fields point at `target`, if `target` is a credential. */
function linkSources(target: string) {
  return hasLinkedFiles(target) ? referencingSections(target).filter((r) => r.section.media && !r.section.media.plain) : [];
}

/** Media targets and entry ids an entry links to, e.g. certifications → [id, …]. */
export function linkedTargets(section: SectionDef, entry: Record<string, string> | undefined): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  if (!entry || !section.media || section.media.plain) return out;
  for (const f of section.fields) {
    if (f.type !== 'refs' || !hasLinkedFiles(f.refSection!)) continue;
    const ids = out.get(f.refSection!) ?? new Set<string>();
    for (const id of splitList(entry[f.key])) ids.add(id);
    out.set(f.refSection!, ids);
  }
  return out;
}

/** Which linked media to re-check after an entry changed from `before` to `after` (either may be missing). */
export function affectedByEntry(section: SectionDef, before: Entry | undefined, after: Entry | undefined): Map<string, Set<string>> {
  // No media folder (skills), or one without shortcuts (posts): no links in Drive, and no folder path to compare below.
  if (!section.media || section.media.plain) return new Map();
  const out = linkedTargets(section, before);
  for (const [target, ids] of linkedTargets(section, after)) out.set(target, new Set([...(out.get(target) ?? []), ...ids]));
  // Unchanged links and folder: nothing to do.
  if (before && after && entryFolderName(section, before) === entryFolderName(section, after) && entryPath(section, before).join('/') === entryPath(section, after).join('/')) {
    const same = (t: string) => [...(linkedTargets(section, before).get(t) ?? [])].sort().join() === [...(linkedTargets(section, after).get(t) ?? [])].sort().join();
    for (const target of [...out.keys()]) if (same(target)) out.delete(target);
  }
  return out;
}

/** Bring shortcuts and Drive descriptions of the target entries' media in line with the current links. */
export async function syncMediaLinks(repos: Repos, getFiles: FileStoreProvider, target: string, targetIds: Iterable<string>) {
  const sources = linkSources(target);
  const ids = new Set(targetIds);
  if (!sources.length || !ids.size) return;
  const media = await listMedia(repos);
  const targetSection = getSection(target)!;
  // A credential's other media aren't linked; only its own file is.
  const items = media.filter((m) => m.section === target && ids.has(m.entryId) && (!targetSection.media?.credential || isCredentialFile(targetSection, m)));
  if (!items.length) return;

  // Entries linking to each target entry, in section order.
  const linkers = new Map<string, { section: SectionDef; entry: Entry }[]>();
  for (const { section, fields } of sources) {
    for (const entry of await repos.get(section.key)!.list()) {
      if (isDraft(entry)) continue; // drafts' links don't count yet
      for (const id of new Set(fields.flatMap((f) => splitList(entry[f.key])))) {
        if (ids.has(id)) linkers.set(id, [...(linkers.get(id) ?? []), { section, entry }]);
      }
    }
  }

  const files = await getFiles();
  // Shortcuts go in a subfolder named after the target section (e.g. Projects/Film/Certificates/), apart from the entry's own media.
  const folders = new Map<string, Promise<{ folderId: string; parentId: string }>>();
  const folderOf = (section: SectionDef, entry: Entry) => {
    const key = `${section.key}:${entry.id}`;
    if (!folders.has(key)) {
      folders.set(
        key,
        (async () => {
          // Reuse the entry's own media folder when it has one, else find or create it by path.
          const parentId = mediaOf(media, entry.id).find((m) => m.section === section.key)?.folderId || (await files.folder(entryPath(section, entry)));
          return { parentId, folderId: await files.folder([...entryPath(section, entry), targetSection.tab]) };
        })(),
      );
    }
    return folders.get(key)!;
  };
  const shortcutPath = (section: SectionDef, entry: Entry) => [...entryPath(section, entry), targetSection.tab].join('/');
  const trashShortcutFolders = async (s: Shortcut) => {
    await files.trashFolderIfEmpty(s.folderId);
    if (s.parentId) await files.trashFolderIfEmpty(s.parentId);
  };

  for (const item of items) {
    const links = linkers.get(item.entryId) ?? [];
    const current = shortcutsOf(item);
    const next: Shortcut[] = [];
    for (const { section, entry } of links) {
      const key = `${section.key}:${entry.id}`;
      const path = shortcutPath(section, entry);
      const existing = current.find((s) => s.entry === key);
      if (existing && existing.path === path) {
        if (existing.name !== item.fileName) await files.update(existing.id, { name: item.fileName });
        next.push({ ...existing, name: item.fileName });
        continue;
      }
      const { folderId, parentId } = await folderOf(section, entry);
      const id = existing ? (await files.update(existing.id, { name: item.fileName, folderId }), existing.id) : await files.createShortcut({ targetId: item.fileId, folderId, name: item.fileName });
      next.push({ entry: key, id, folderId, parentId, path, name: item.fileName });
      if (existing && existing.folderId !== folderId) await trashShortcutFolders(existing);
    }
    for (const gone of current.filter((s) => !next.some((n) => n.entry === s.entry))) {
      await files.trash(gone.id);
      await trashShortcutFolders(gone);
    }

    const linkedTo = links.map(({ section, entry }) => `${section.label}: ${entryFolderName(section, entry)}`).join(' · ');
    if (linkedTo !== item.linkedTo) await files.update(item.fileId, { description: driveDescription(item, linkedTo) });
    const shortcuts = next.length ? JSON.stringify(next) : '';
    if (linkedTo !== item.linkedTo || shortcuts !== item.shortcuts) await repos.get(MEDIA)!.update(item.id, { linkedTo, shortcuts });
  }
}

/** Re-check every linked media file, e.g. after links were edited in the sheet by hand. */
export async function syncAllMediaLinks(repos: Repos, getFiles: FileStoreProvider) {
  for (const section of SECTIONS) {
    if (!linkSources(section.key).length) continue;
    const media = await listMedia(repos);
    const ids = new Set(media.filter((m) => m.section === section.key).map((m) => m.entryId));
    await syncMediaLinks(repos, getFiles, section.key, ids);
    // Other media that got shortcuts before roles existed lose them.
    for (const item of media.filter((m) => m.section === section.key && m.shortcuts && !isCredentialFile(section, m))) {
      const files = await getFiles();
      for (const s of shortcutsOf(item)) {
        await files.trash(s.id);
        await files.trashFolderIfEmpty(s.folderId);
      }
      await repos.get(MEDIA)!.update(item.id, { shortcuts: '', linkedTo: '' });
    }
  }
}

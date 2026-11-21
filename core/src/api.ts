import {
  DOMAIN_LIST,
  LOCATION_LIST,
  DRAFT_COLUMN,
  MEDIA,
  MEDIA_MAX_BYTES,
  driveDescription,
  isMediaType,
  isVideo,
  hasImageSlots,
  mediaKind,
  maxBytesFor,
  mediaRole,
  ORGANIZATIONS,
  SECTIONS,
  SKILLS,
  fieldErrors,
  getSection,
  isDraft,
  mediaSchema,
  sectionSchema,
  splitList,
  type Entry,
  type MediaItem,
  type SectionDef,
} from '@profile/shared';
import { HttpError, describeError } from './errors';
import { detectMediaType } from './fileType';
import { assertUniqueDomain, registerDomains, renameDomain } from './domains';
import type { FileStoreProvider } from './files';
import { assertUniqueLocation, registerLocation, renameLocation } from './locations';
import { assertExclusiveRefs, dropStaleRefs, parseLinkedFrom, setLinkedFrom, unlinkEverywhere, unpickMedia } from './links';
import { addMedia, deleteMedia, listMedia, mediaSection, planMedia, recordMedia, removeEntryMedia, reorderMedia, replaceOlderMedia, syncEntryMedia, updateMedia, type MediaPlan } from './media';
import { affectedByEntry, syncMediaLinks } from './mediaLinks';
import { assertUniqueOrganization, parseOrganizationThai, registerOrganizations, renameOrganization, setOrganizationThai } from './organizations';
import type { RepoProvider } from './repo';
import { assertUniqueSkill, registerSkills, renameSkill } from './skills';
import { fillSuggestionThai } from './suggestions';

export interface ApiContext {
  getRepos: RepoProvider;
  /** Media storage; may throw (e.g. ConfigError) when it isn't set up. */
  getFiles: FileStoreProvider;
  /** Ends every media file name, e.g. "Tammasorn". */
  mediaOwner: string;
  /**
   * Runs follow-up work that the caller needn't wait for (Drive shortcuts and descriptions).
   * Defaults to running it before returning; a server can queue it to answer sooner.
   */
  defer?: (task: () => Promise<void>) => Promise<void>;
}

function parse<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: Parameters<typeof fieldErrors>[0] } }, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw new HttpError(400, 'Validation failed', fieldErrors(result.error));
  return result.data;
}

/**
 * Everything the app can do, independent of HTTP. The Express routes and the Apps Script
 * entry point both translate requests into these calls.
 */
export function createApi({ getRepos, getFiles, mediaOwner, defer = (task) => task() }: ApiContext) {
  /** Update Drive shortcuts and descriptions for linked media; failures are logged, never thrown. */
  function syncLinks(targets: Map<string, Set<string>>) {
    const pending = [...targets].filter(([, ids]) => ids.size);
    if (!pending.length) return Promise.resolve();
    return defer(async () => {
      const repos = await getRepos();
      for (const [target, ids] of pending) {
        await syncMediaLinks(repos, getFiles, target, ids).catch((err) => console.error('[media] updating linked files failed:', describeError(err)));
      }
    });
  }

  async function resolve(key: string, singleton: boolean) {
    const section = getSection(key);
    if (!section || !!section.singleton !== singleton) throw new HttpError(404, `Unknown section "${key}"`);
    const repos = await getRepos();
    return { section, repos, repo: repos.get(section.key)! };
  }

  /** Validate a body, then drop link ids that don't point at an existing entry. Marks drafts. */
  async function parseEntry(section: SectionDef, body: unknown, draft = false) {
    if (draft && !section.drafts) throw new HttpError(400, `${section.label} can't be saved as drafts`);
    const data = await dropStaleRefs(await getRepos(), section, parse<Record<string, string>>(sectionSchema(section, { draft }), body));
    if (section.drafts) data[DRAFT_COLUMN] = draft ? 'true' : '';
    return data;
  }

  return {
    /** Throws when the sheet can't be reached; media storage is reported, not required. */
    async health(): Promise<{ ok: true; media: { ok: boolean; error?: string } }> {
      await getRepos();
      const media = await getFiles().then(
        () => ({ ok: true }),
        (err) => ({ ok: false, error: describeError(err) }),
      );
      return { ok: true, media };
    },

    // Dump everything, e.g. for backups or migrating off Sheets.
    async exportAll() {
      const repos = await getRepos();
      const entries = await Promise.all(SECTIONS.map(async (s) => [s.key, await repos.get(s.key)!.list()] as const));
      return { exportedAt: new Date().toISOString(), sections: Object.fromEntries(entries), media: await repos.get(MEDIA)!.list() };
    },

    // Singleton sections (About): one row, read and upserted as a whole.
    async getSingle(key: string): Promise<Entry | null> {
      const { repo } = await resolve(key, true);
      return (await repo.list())[0] ?? null;
    },

    async saveSingle(key: string, body: unknown): Promise<Entry> {
      const { section, repo } = await resolve(key, true);
      const data = await parseEntry(section, body);
      const [existing] = await repo.list();
      return existing ? repo.update(existing.id, data) : repo.create(data);
    },

    // List sections.
    async listEntries(key: string): Promise<Entry[]> {
      return (await resolve(key, false)).repo.list();
    },

    async getEntry(key: string, id: string): Promise<Entry> {
      return (await resolve(key, false)).repo.get(id);
    },

    /** `draft`: save unfinished; organizations, skills and Drive links wait until it's saved for real. */
    async createEntry(key: string, body: unknown, { draft = false } = {}): Promise<Entry> {
      const { section, repos, repo } = await resolve(key, false);
      const data = await parseEntry(section, body, draft);
      const linkedFrom = await parseLinkedFrom(repos, section, body);
      const organizationThai = parseOrganizationThai(section, body);
      await assertExclusiveRefs(repos, section, data);
      if (section.key === ORGANIZATIONS) await assertUniqueOrganization(repos, data.name);
      if (section.key === SKILLS) await assertUniqueSkill(repos, data.name);
      if (section.key === DOMAIN_LIST) await assertUniqueDomain(repos, data.name);
      if (section.key === LOCATION_LIST) await assertUniqueLocation(repos, data.name);
      const entry = await repo.create(data);
      await setLinkedFrom(repos, section, entry.id, linkedFrom);
      await setOrganizationThai(repos, section, entry, organizationThai);
      await fillSuggestionThai(repos, section, entry);
      if (draft) return entry;
      await registerOrganizations(repos, section, entry);
      await registerSkills(repos, section, entry);
      await registerDomains(repos, section, entry);
      await registerLocation(repos, section, entry);
      await syncLinks(affectedByEntry(section, undefined, entry));
      return entry;
    },

    /** Saving a draft without `draft` publishes it; saving a published entry with `draft` makes it a draft again. */
    async updateEntry(key: string, id: string, body: unknown, { draft = false } = {}): Promise<Entry> {
      const { section, repos, repo } = await resolve(key, false);
      const before = await repo.get(id);
      const data = await parseEntry(section, body, draft);
      const linkedFrom = await parseLinkedFrom(repos, section, body);
      const organizationThai = parseOrganizationThai(section, body);
      await assertExclusiveRefs(repos, section, data, before);
      if (section.key === ORGANIZATIONS) await assertUniqueOrganization(repos, data.name, before.id);
      if (section.key === SKILLS) await assertUniqueSkill(repos, data.name, before.id);
      if (section.key === DOMAIN_LIST) await assertUniqueDomain(repos, data.name, before.id);
      if (section.key === LOCATION_LIST) await assertUniqueLocation(repos, data.name, before.id);
      const entry = await repo.update(before.id, data);
      await setLinkedFrom(repos, section, entry.id, linkedFrom);
      await setOrganizationThai(repos, section, entry, organizationThai);
      await fillSuggestionThai(repos, section, entry);
      // A draft's files still follow its folder name; nothing else happens until it's published.
      if (draft) {
        await syncEntryMedia(repos, getFiles, section, before, entry, mediaOwner).catch((err) => console.error('[media] moving files failed:', describeError(err)));
        // Back to a draft: its links stop counting, as if it had never been published, so its shortcuts go.
        if (!isDraft(before)) await syncLinks(new Map([...affectedByEntry(section, before, undefined), [section.key, new Set([entry.id])]]));
        return entry;
      }
      if (section.key === ORGANIZATIONS) await renameOrganization(repos, before, entry);
      if (section.key === SKILLS) await renameSkill(repos, before, entry);
      if (section.key === DOMAIN_LIST) await renameDomain(repos, before, entry);
      if (section.key === LOCATION_LIST) await renameLocation(repos, before, entry);
      await registerOrganizations(repos, section, entry);
      await registerSkills(repos, section, entry);
      await registerDomains(repos, section, entry, before);
      await registerLocation(repos, section, entry, before);
      // The entry is saved either way; a Drive hiccup only leaves its files where they were.
      await syncEntryMedia(repos, getFiles, section, before, entry, mediaOwner).catch((err) => console.error('[media] moving files failed:', describeError(err)));
      // Its links (shortcuts in its folder), and its own files' shortcuts elsewhere if it is linked to.
      // A draft's links never counted, so publishing it adds them all.
      await syncLinks(new Map([...affectedByEntry(section, isDraft(before) ? undefined : before, entry), [section.key, new Set([entry.id])]]));
      return entry;
    },

    /** Remove one link from an entry (e.g. a certificate from a project), leaving the rest of the entry as it is. */
    async unlinkEntry(key: string, id: string, targetKey: string, targetId: string): Promise<Entry> {
      const { section, repo } = await resolve(key, false);
      const before = await repo.get(id);
      const changes: Record<string, string> = {};
      for (const f of section.fields) {
        const ids = f.type === 'refs' && f.refSection === targetKey ? splitList(before[f.key]) : [];
        if (ids.includes(targetId)) changes[f.key] = ids.filter((x) => x !== targetId).join(',');
      }
      if (!Object.keys(changes).length) return before;
      const entry = await repo.update(before.id, changes);
      // Its folder loses the shortcut to the unlinked entry's files (a draft's links never counted).
      if (!isDraft(before)) await syncLinks(affectedByEntry(section, before, entry));
      return entry;
    },

    async deleteEntry(key: string, id: string): Promise<void> {
      const { section, repos, repo } = await resolve(key, false);
      const before = await repo.get(id);
      await repo.remove(id);
      await unlinkEverywhere(repos, section.key, id);
      // Its files go too, so posts that picked them let them go.
      const files = (await repos.get(MEDIA)!.list()).filter((m) => m.entryId === id).map((m) => m.id);
      await removeEntryMedia(repos, getFiles, id);
      await unpickMedia(repos, files);
      if (!isDraft(before)) await syncLinks(affectedByEntry(section, before, undefined));
    },

    async listMedia(): Promise<MediaItem[]> {
      return listMedia(await getRepos());
    },

    /** `fields`: section, entryId, title, description as sent; `file`: the uploaded bytes. */
    async addMedia(fields: Record<string, unknown>, file: Uint8Array | undefined): Promise<MediaItem> {
      const section = mediaSection(String(fields.section ?? ''));
      const details = parse(mediaSchema, fields);
      if (!file) throw new HttpError(400, 'Validation failed', { file: 'Choose a file' });
      const mimeType = detectMediaType(file);
      if (!mimeType) throw new HttpError(400, 'Validation failed', { file: 'Only JPG, PNG, PDF, MP4, MOV or WebM files, or TXT as a detail file' });
      if (file.length > MEDIA_MAX_BYTES) throw new HttpError(413, 'Validation failed', { file: `Upload files over ${MEDIA_MAX_BYTES / 1024 / 1024} MB in pieces` });
      const role = mediaRole(section, fields.role);
      if (mediaKind(mimeType) === 'text' && role !== 'detail') throw new HttpError(400, 'Validation failed', { file: 'Text files can only be detail files' });
      if (role === 'credential' && isVideo(mimeType)) throw new HttpError(400, 'Validation failed', { file: `The ${section.media!.credential!.label.toLowerCase()} must be a JPG, PNG or PDF` });
      if (role === 'detail' && isVideo(mimeType)) throw new HttpError(400, 'Validation failed', { file: 'Detail files must be JPG, PNG, PDF or TXT' });
      if (hasImageSlots(section) && mediaKind(mimeType) !== 'image') throw new HttpError(400, 'Validation failed', { file: 'Use a JPG or PNG image' });
      const repos = await getRepos();
      let item = await addMedia(repos, await getFiles(), { ...details, section: section.key, entryId: String(fields.entryId ?? ''), mimeType, data: file, owner: mediaOwner, role });
      // A profile photo, background or logo replaces the previous one.
      if (hasImageSlots(section)) item = await replaceOlderMedia(repos, getFiles, item, mediaOwner);
      await syncLinks(new Map([[section.key, new Set([item.entryId])]]));
      return item;
    },

    /**
     * First step of a large upload (a video, or an image or PDF over MEDIA_MAX_BYTES): checks the details and says
     * where the file goes. The caller sends the file to Drive in pieces, checks its first bytes, then calls
     * finishLargeUpload.
     */
    async startLargeUpload(fields: Record<string, unknown>): Promise<MediaPlan & { size: number; driveDescription: string }> {
      const section = mediaSection(String(fields.section ?? ''));
      const details = parse(mediaSchema, fields);
      const mimeType = String(fields.mimeType ?? '');
      const size = Number(fields.size);
      // Text is checked whole, so it's always sent in one request.
      if (!isMediaType(mimeType) || mediaKind(mimeType) === 'text') {
        throw new HttpError(400, 'Validation failed', { file: 'Only JPG, PNG, PDF, MP4, MOV or WebM files upload in pieces' });
      }
      if (!Number.isInteger(size) || size <= 0) throw new HttpError(400, 'Validation failed', { file: 'The file is empty' });
      if (size > maxBytesFor(mimeType)) {
        throw new HttpError(413, 'Validation failed', { file: `${isVideo(mimeType) ? 'Videos' : 'Images and PDFs'} can be at most ${maxBytesFor(mimeType) / 1024 / 1024} MB` });
      }
      const role = mediaRole(section, fields.role);
      if (role === 'credential' && isVideo(mimeType)) throw new HttpError(400, 'Validation failed', { file: `The ${section.media!.credential!.label.toLowerCase()} must be a JPG, PNG or PDF` });
      if (role === 'detail' && isVideo(mimeType)) throw new HttpError(400, 'Validation failed', { file: 'Detail files must be JPG, PNG, PDF or TXT' });
      // A profile photo, background or logo replaces the one before; kept small, it's sent in one request.
      if (hasImageSlots(section)) throw new HttpError(400, 'Validation failed', { file: `Use a JPG or PNG image up to ${MEDIA_MAX_BYTES / 1024 / 1024} MB` });
      const repos = await getRepos();
      const plan = await planMedia(repos, await getFiles(), { ...details, section: section.key, entryId: String(fields.entryId ?? ''), mimeType: mimeType as MediaPlan['mimeType'], owner: mediaOwner, role });
      return { ...plan, size, driveDescription: driveDescription(plan, '') };
    },

    /** Last step of a large upload: the file is in Drive as planned; save its row. */
    async finishLargeUpload(plan: MediaPlan, fileId: string, size: number): Promise<MediaItem> {
      const item = await recordMedia(await getRepos(), await getFiles(), plan, fileId, size);
      await syncLinks(new Map([[item.section, new Set([item.entryId])]]));
      return item;
    },

    async updateMedia(id: string, body: unknown): Promise<MediaItem> {
      const item = await updateMedia(await getRepos(), getFiles, id, parse(mediaSchema, body), mediaOwner);
      await syncLinks(new Map([[item.section, new Set([item.entryId])]])); // shortcuts follow a rename
      return item;
    },

    /** `ids`: every media id of the entry, in the new order. */
    async reorderMedia(body: unknown): Promise<MediaItem[]> {
      const { entryId, ids } = (body ?? {}) as { entryId?: unknown; ids?: unknown };
      if (typeof entryId !== 'string' || !Array.isArray(ids) || !ids.every((i) => typeof i === 'string')) {
        throw new HttpError(400, 'Send { entryId, ids: [...] }');
      }
      return reorderMedia(await getRepos(), entryId, ids as string[]);
    },

    async deleteMedia(id: string): Promise<void> {
      const repos = await getRepos();
      await deleteMedia(repos, getFiles, id);
      await unpickMedia(repos, [id]);
    },

    async getMedia(id: string): Promise<MediaItem> {
      return (await (await getRepos()).get(MEDIA)!.get(id)) as MediaItem;
    },

    async mediaFile(id: string): Promise<{ item: MediaItem; data: Uint8Array }> {
      const item = (await (await getRepos()).get(MEDIA)!.get(id)) as MediaItem;
      return { item, data: await (await getFiles()).download(item.fileId) };
    },
  };
}

export type Api = ReturnType<typeof createApi>;

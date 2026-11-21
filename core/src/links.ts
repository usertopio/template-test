import { MEDIA, SECTIONS, exclusiveHolders, getSection, linkedFromFields, linkedFromKey, referencingSections, splitList, type Entry, type SectionDef } from '@profile/shared';
import { HttpError } from './errors';
import type { Repos } from './repo';

/**
 * Exclusive links (FieldDef.exclusive, e.g. certificates): refuse ids newly linked here that another entry of
 * the same section already links, naming it. Ids the entry already had are left alone, so older data still saves.
 */
export async function assertExclusiveRefs(repos: Repos, section: SectionDef, data: Record<string, string>, before?: Entry) {
  const errors: Record<string, string> = {};
  for (const field of section.fields) {
    if (field.type !== 'refs' || !field.exclusive) continue;
    const added = splitList(data[field.key]).filter((id) => !splitList(before?.[field.key]).includes(id));
    if (!added.length) continue;
    const target = getSection(field.refSection!)!;
    const entries = await repos.get(section.key)!.list();
    const names = new Map((await repos.get(target.key)!.list()).map((e) => [e.id, e[target.titleField] || '(untitled)']));
    for (const id of added) {
      const [holder] = exclusiveHolders(section, target.key, id, entries, before?.id);
      if (!holder) continue;
      const where = `${section.itemLabel ?? section.label} “${holder[section.titleField] || '(untitled)'}”`;
      errors[field.key] = `“${names.get(id) ?? id}” is already linked to ${where}. Unlink it there first.`;
    }
  }
  if (Object.keys(errors).length) throw new HttpError(409, 'Already linked elsewhere', errors);
}

/** Drop link ids that don't point at an existing entry (e.g. rows deleted in the sheet). */
export async function dropStaleRefs(repos: Repos, section: SectionDef, data: Record<string, string>) {
  for (const field of section.fields) {
    if ((field.type !== 'refs' && field.type !== 'media') || !data[field.key]) continue;
    const existing = new Set((await repos.get(field.type === 'media' ? MEDIA : field.refSection!)!.list()).map((e) => e.id));
    data[field.key] = splitList(data[field.key])
      .filter((id) => existing.has(id))
      .join(',');
  }
  return data;
}

/** Remove deleted files' ids from every 'media' field (a post's picked photos), so none points at nothing. */
export async function unpickMedia(repos: Repos, ids: string[]) {
  if (!ids.length) return;
  for (const section of SECTIONS) {
    const fields = section.fields.filter((f) => f.type === 'media');
    if (!fields.length) continue;
    const repo = repos.get(section.key)!;
    for (const entry of await repo.list()) {
      const changes: Record<string, string> = {};
      for (const f of fields) {
        const picked = splitList(entry[f.key]);
        if (picked.some((id) => ids.includes(id))) changes[f.key] = picked.filter((id) => !ids.includes(id)).join(',');
      }
      if (Object.keys(changes).length) await repo.update(entry.id, changes);
    }
  }
}

/** Remove a deleted entry's id from every refs field that points at its section. */
export async function unlinkEverywhere(repos: Repos, sectionKey: string, id: string) {
  for (const { section, fields } of referencingSections(sectionKey)) {
    const repo = repos.get(section.key)!;
    for (const entry of await repo.list()) {
      const changes: Record<string, string> = {};
      for (const f of fields) {
        const ids = splitList(entry[f.key]);
        if (ids.includes(id)) changes[f.key] = ids.filter((x) => x !== id).join(',');
      }
      if (Object.keys(changes).length) await repo.update(entry.id, changes);
    }
  }
}

/**
 * The entries of other sections that should link to an entry, as sent with it (see linkedFromKey), e.g. the posts
 * picked in a project's "Linked posts": section key -> ids. A section left out of the body is left as it is.
 */
export async function parseLinkedFrom(repos: Repos, target: SectionDef, body: unknown): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const errors: Record<string, string> = {};
  for (const { section } of linkedFromFields(target.key)) {
    const key = linkedFromKey(section.key);
    const raw = (body as Record<string, unknown> | null | undefined)?.[key];
    if (raw === undefined) continue;
    if (typeof raw !== 'string') {
      errors[key] = 'Send the ids separated by commas';
      continue;
    }
    const ids = splitList(raw);
    const existing = new Set((await repos.get(section.key)!.list()).map((e) => e.id));
    const unknown = ids.filter((id) => !existing.has(id));
    if (unknown.length) errors[key] = `No ${section.itemLabel ?? 'entry'} with the id ${unknown.join(', ')}`;
    else out.set(section.key, ids);
  }
  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed', errors);
  return out;
}

/**
 * Make exactly the `wanted` entries of each section link to entry `id`, adding it to their field or removing it,
 * so the link stays stored in one place. These links (posts, activities) never point at a credential, so nothing
 * follows in Drive (see mediaLinks).
 */
export async function setLinkedFrom(repos: Repos, target: SectionDef, id: string, wanted: Map<string, string[]>) {
  for (const [key, ids] of wanted) {
    const { field } = linkedFromFields(target.key).find((l) => l.section.key === key)!;
    const repo = repos.get(key)!;
    for (const entry of await repo.list()) {
      const current = splitList(entry[field.key]);
      const want = ids.includes(entry.id);
      if (current.includes(id) === want) continue;
      await repo.update(entry.id, { [field.key]: (want ? [...current, id] : current.filter((x) => x !== id)).join(',') });
    }
  }
}

import { LOCATION_LIST, isDraft, locationSections, orgKey, suggestionThai, translationKey, type Entry, type SectionDef } from '@profile/shared';
import { HttpError } from './errors';
import type { Repos } from './repo';

const tidy = (value = '') => value.trim().replace(/\s+/g, ' ');

/**
 * Add the place `entry` names to the Locations page if it isn't there. Only a place new on this entry (compared
 * with `before`) counts, so one deleted from the page doesn't come back when an old entry is saved again.
 */
export async function registerLocation(repos: Repos, section: SectionDef, entry: Record<string, string>, before?: Entry) {
  const field = locationSections().find((l) => l.section.key === section.key)?.field;
  const name = field ? tidy(entry[field.key]) : '';
  if (!name) return;
  const old = before && !isDraft(before) ? before : undefined;
  if (old && orgKey(old[field!.key]) === orgKey(name)) return;
  const repo = repos.get(LOCATION_LIST)!;
  if (!(await repo.list()).some((l) => orgKey(l.name) === orgKey(name))) await repo.create({ name });
}

/** Reject a place name that another row already uses. */
export async function assertUniqueLocation(repos: Repos, name: string, exceptId?: string) {
  const clash = (await repos.get(LOCATION_LIST)!.list()).find((l) => l.id !== exceptId && orgKey(l.name) === orgKey(name));
  if (clash) throw new HttpError(400, 'Validation failed', { name: `"${clash.name}" already exists` });
}

/** After a place is renamed on the Locations page, update every entry there. */
export async function renameLocation(repos: Repos, before: Entry, after: Entry) {
  if (before.name === after.name) return;
  for (const { section, field } of locationSections()) {
    const repo = repos.get(section.key)!;
    for (const entry of await repo.list()) {
      if (orgKey(entry[field.key]) === orgKey(before.name)) await repo.update(entry.id, { [field.key]: after.name });
    }
  }
}

/**
 * Fill an empty Locations page with the places entries already name, each once. Run when the tab is first
 * created; after that the page is the user's to edit.
 */
export async function seedLocations(repos: Repos) {
  const repo = repos.get(LOCATION_LIST)!;
  if ((await repo.list()).length) return;
  const names = new Map<string, string>();
  for (const { section, field } of locationSections()) {
    for (const e of await repos.get(section.key)!.list()) {
      const name = tidy(e[field.key]);
      if (name && !names.has(orgKey(name))) names.set(orgKey(name), name);
    }
  }
  for (const name of names.values()) await repo.create({ name });
}

/**
 * Move the Thai typed on entries (location_th: from when each entry kept its own) to the Locations page, where it
 * now lives, then clear it on the entries so this runs once. Thai already on the page wins.
 */
export async function migrateLocationThai(repos: Repos) {
  const repo = repos.get(LOCATION_LIST)!;
  for (const { section, field } of locationSections()) {
    const column = translationKey(field.key, 'th');
    const entryRepo = repos.get(section.key)!;
    const entries = (await entryRepo.list()).filter((e) => e[column]?.trim());
    if (!entries.length) continue;
    const thai = suggestionThai(field, entries);
    for (const row of await repo.list()) {
      const th = thai.get(orgKey(row.name));
      if (th && !row.name_th?.trim()) await repo.update(row.id, { name_th: th });
    }
    for (const e of entries) await entryRepo.update(e.id, { [column]: '' });
  }
}

/**
 * Activities had an Online tick box before their Location type (Onsite, Online, Hybrid). Turn a ticked one into
 * Online, or Hybrid when it also names a place, then clear the box so this runs once. A type already set wins.
 */
export async function migrateActivityOnline(repos: Repos) {
  const repo = repos.get('activities')!;
  for (const e of await repo.list()) {
    if (e.online !== 'true') continue;
    await repo.update(e.id, { online: '', ...(e.locationType?.trim() ? {} : { locationType: e.location?.trim() ? 'Hybrid' : 'Online' }) });
  }
}

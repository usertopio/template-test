import { ORGANIZATIONS, organizationSections, orgKey, type Entry, type SectionDef } from '@profile/shared';
import { HttpError } from './errors';
import type { SheetRepository } from './sheets/repo';

type Repos = Map<string, SheetRepository>;

/** Add any organizations named by `entry` that aren't in the Organizations tab yet. */
export async function registerOrganizations(repos: Repos, section: SectionDef, entry: Record<string, string>) {
  const fields = section.fields.filter((f) => f.organization && entry[f.key]?.trim());
  if (!fields.length) return;
  const orgRepo = repos.get(ORGANIZATIONS)!;
  const known = new Set((await orgRepo.list()).map((o) => orgKey(o.name)));
  for (const f of fields) {
    const name = entry[f.key].trim().replace(/\s+/g, ' ');
    if (known.has(orgKey(name))) continue;
    await orgRepo.create({ name, type: f.organization! });
    known.add(orgKey(name));
  }
}

/** Register organizations for every existing entry, e.g. rows added before this tab existed. */
export async function backfillOrganizations(repos: Repos) {
  for (const { section } of organizationSections()) {
    for (const entry of await repos.get(section.key)!.list()) await registerOrganizations(repos, section, entry);
  }
}

/** Reject a name that another organization already uses. */
export async function assertUniqueOrganization(repos: Repos, name: string, exceptId?: string) {
  const clash = (await repos.get(ORGANIZATIONS)!.list()).find((o) => o.id !== exceptId && orgKey(o.name) === orgKey(name));
  if (clash) throw new HttpError(400, 'Validation failed', { name: `"${clash.name}" already exists` });
}

/** After an organization is renamed, update every entry that used the old name. */
export async function renameOrganization(repos: Repos, before: Entry, after: Entry) {
  if (orgKey(before.name) === orgKey(after.name) && before.name === after.name) return;
  for (const { section, fields } of organizationSections()) {
    const repo = repos.get(section.key)!;
    for (const entry of await repo.list()) {
      const changes = Object.fromEntries(fields.filter((f) => orgKey(entry[f.key]) === orgKey(before.name)).map((f) => [f.key, after.name]));
      if (Object.keys(changes).length) await repo.update(entry.id, changes);
    }
  }
}

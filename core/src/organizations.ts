import { ORGANIZATION_THAI, ORGANIZATIONS, isDraft, joinOrganizations, organizationSections, orgKey, splitOrganizations, translationKey, type Entry, type SectionDef } from '@profile/shared';
import { HttpError } from './errors';
import type { Repos } from './repo';

/** Add any organizations named by `entry` that aren't in the Organizations tab yet. */
export async function registerOrganizations(repos: Repos, section: SectionDef, entry: Record<string, string>) {
  const fields = section.fields.filter((f) => f.organization && entry[f.key]?.trim());
  if (!fields.length) return;
  const orgRepo = repos.get(ORGANIZATIONS)!;
  const known = new Set((await orgRepo.list()).map((o) => orgKey(o.name)));
  for (const f of fields) {
    for (const name of splitOrganizations(entry[f.key])) {
      if (known.has(orgKey(name))) continue;
      await orgRepo.create({ name, type: f.organization! });
      known.add(orgKey(name));
    }
  }
}

/** Register organizations for every existing entry, e.g. rows added before this tab existed. */
export async function backfillOrganizations(repos: Repos) {
  for (const { section } of organizationSections()) {
    for (const entry of await repos.get(section.key)!.list()) if (!isDraft(entry)) await registerOrganizations(repos, section, entry);
  }
}

/** Reject a name that another organization already uses, or with a ";" (it separates organizations in an entry). */
export async function assertUniqueOrganization(repos: Repos, name: string, exceptId?: string) {
  if (name.includes(';')) throw new HttpError(400, 'Validation failed', { name: 'An organization name can\'t contain ";"' });
  const clash = (await repos.get(ORGANIZATIONS)!.list()).find((o) => o.id !== exceptId && orgKey(o.name) === orgKey(name));
  if (clash) throw new HttpError(400, 'Validation failed', { name: `"${clash.name}" already exists` });
}

/** After an organization is renamed, update every entry that used the old name. */
export async function renameOrganization(repos: Repos, before: Entry, after: Entry) {
  if (orgKey(before.name) === orgKey(after.name) && before.name === after.name) return;
  for (const { section, fields } of organizationSections()) {
    const repo = repos.get(section.key)!;
    for (const entry of await repo.list()) {
      const changes: Record<string, string> = {};
      for (const f of fields) {
        const names = splitOrganizations(entry[f.key]);
        if (names.some((n) => orgKey(n) === orgKey(before.name))) changes[f.key] = joinOrganizations(names.map((n) => (orgKey(n) === orgKey(before.name) ? after.name : n)));
      }
      if (Object.keys(changes).length) await repo.update(entry.id, changes);
    }
  }
}

/**
 * Thai names of the organizations an entry names, as given in its form (see organizationThaiKey): English name ->
 * Thai name. An organization left out of the body keeps its Thai name.
 */
export function parseOrganizationThai(section: SectionDef, body: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const errors: Record<string, string> = {};
  if (!section.fields.some((f) => f.organization)) return out;
  for (const [key, raw] of Object.entries((body ?? {}) as Record<string, unknown>)) {
    if (!key.startsWith(ORGANIZATION_THAI)) continue;
    if (typeof raw !== 'string') errors[key] = 'Send the Thai name as text';
    else out.set(key.slice(ORGANIZATION_THAI.length), raw.trim().replace(/\s+/g, ' '));
  }
  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed', errors);
  return out;
}

/**
 * Give the organizations `entry` names the Thai names from its form; names it doesn't name are ignored. A new one is
 * added with it straight away, even from a draft: typing its Thai name says it's meant (a draft's other
 * organizations wait until it's saved).
 */
export async function setOrganizationThai(repos: Repos, section: SectionDef, entry: Record<string, string>, thai: Map<string, string>) {
  const orgRepo = repos.get(ORGANIZATIONS)!;
  const column = translationKey('name', 'th');
  for (const [given, th] of thai) {
    const field = section.fields.find((f) => f.organization && splitOrganizations(entry[f.key]).some((n) => orgKey(n) === orgKey(given)));
    if (!field) continue;
    const name = splitOrganizations(entry[field.key]).find((n) => orgKey(n) === orgKey(given))!;
    const org = (await orgRepo.list()).find((o) => orgKey(o.name) === orgKey(name));
    if (org) {
      if ((org[column] ?? '') !== th) await orgRepo.update(org.id, { [column]: th });
    } else if (th) await orgRepo.create({ name, type: field.organization!, [column]: th });
  }
}

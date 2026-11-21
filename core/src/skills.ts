import { SKILLS, isDraft, orgKey, skillSections, splitList, type Entry, type SectionDef } from '@profile/shared';
import { HttpError } from './errors';
import type { Repos } from './repo';

// Skill names are matched like organization names: case and spacing insensitive.
const skillKey = orgKey;

/** Add any skills tagged on `entry` that aren't in the Skills tab yet. */
export async function registerSkills(repos: Repos, section: SectionDef, entry: Record<string, string>) {
  const names = section.fields.filter((f) => f.skill).flatMap((f) => splitList(entry[f.key]));
  if (!names.length) return;
  const skillRepo = repos.get(SKILLS)!;
  const known = new Set((await skillRepo.list()).map((s) => skillKey(s.name)));
  for (const raw of names) {
    const name = raw.replace(/\s+/g, ' ');
    if (known.has(skillKey(name))) continue;
    await skillRepo.create({ name });
    known.add(skillKey(name));
  }
}

/** Register skills for every existing entry, e.g. tags added before skills were linked. */
export async function backfillSkills(repos: Repos) {
  for (const { section } of skillSections()) {
    for (const entry of await repos.get(section.key)!.list()) if (!isDraft(entry)) await registerSkills(repos, section, entry);
  }
}

/** Reject a name that another skill already uses. */
export async function assertUniqueSkill(repos: Repos, name: string, exceptId?: string) {
  const clash = (await repos.get(SKILLS)!.list()).find((s) => s.id !== exceptId && skillKey(s.name) === skillKey(name));
  if (clash) throw new HttpError(400, 'Validation failed', { name: `"${clash.name}" already exists` });
}

/** After a skill is renamed, update every entry tagged with the old name. */
export async function renameSkill(repos: Repos, before: Entry, after: Entry) {
  if (before.name === after.name) return;
  for (const { section, fields } of skillSections()) {
    const repo = repos.get(section.key)!;
    for (const entry of await repo.list()) {
      const changes: Record<string, string> = {};
      for (const f of fields) {
        const tags = splitList(entry[f.key]);
        if (!tags.some((t) => skillKey(t) === skillKey(before.name))) continue;
        changes[f.key] = splitList(tags.map((t) => (skillKey(t) === skillKey(before.name) ? after.name : t)).join(',')).join(', ');
      }
      if (Object.keys(changes).length) await repo.update(entry.id, changes);
    }
  }
}

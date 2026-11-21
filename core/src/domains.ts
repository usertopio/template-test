import { DOMAIN_LIST, DOMAINS, SUBDOMAINS, domainSections, isDraft, itemThai, joinItemThai, orgKey, splitList, suggestionThai, translationKey, type Entry, type SectionDef } from '@profile/shared';
import { HttpError } from './errors';
import type { Repos } from './repo';

const tidy = (value = '') => value.trim().replace(/\s+/g, ' ');

/** The items of a list cell, tidied; commas can't be in one, since they separate them. */
const items = (value = '') => splitList(value).map(tidy);

/**
 * Add the domains and subdomains `entry` names to the Domains page if they aren't there; a new subdomain goes under
 * the entry's first domain. Only values new on this entry (compared with `before`) count, so one deleted from the
 * page doesn't come back when an old entry is saved.
 */
export async function registerDomains(repos: Repos, section: SectionDef, entry: Record<string, string>, before?: Entry) {
  const fields = domainSections().find((d) => d.section.key === section.key);
  if (!fields) return;
  const old = before && !isDraft(before) ? before : undefined;
  const isNew = (key: string) => {
    const had = new Set(items(old?.[key]).map(orgKey));
    return items(entry[key]).filter((n) => !had.has(orgKey(n)));
  };
  const domains = items(entry[fields.domain.key]);
  const newDomains = isNew(fields.domain.key);
  const newSubs = fields.subdomain && domains.length ? isNew(fields.subdomain.key) : [];
  if (!newDomains.length && !newSubs.length) return;

  const repo = repos.get(DOMAIN_LIST)!;
  const rows = await repo.list();
  const rowOf = (name: string) => rows.find((d) => orgKey(d.name) === orgKey(name));
  for (const name of newDomains) if (!rowOf(name)) rows.push(await repo.create({ name, subdomains: '' }));
  // Already under one of the entry's domains: nothing to add.
  const listed = new Set(domains.flatMap((d) => items(rowOf(d)?.subdomains)).map(orgKey));
  const adding = newSubs.filter((s) => !listed.has(orgKey(s)));
  if (!adding.length) return;
  const first = rowOf(domains[0]) ?? (await repo.create({ name: domains[0], subdomains: '' }));
  await repo.update(first.id, { subdomains: [...items(first.subdomains), ...adding].join(', ') });
}

/** Reject a domain name that another row already uses. */
export async function assertUniqueDomain(repos: Repos, name: string, exceptId?: string) {
  const clash = (await repos.get(DOMAIN_LIST)!.list()).find((d) => d.id !== exceptId && orgKey(d.name) === orgKey(name));
  if (clash) throw new HttpError(400, 'Validation failed', { name: `"${clash.name}" already exists` });
}

/** After a domain is renamed on the Domains page, update every project and activity that used the old name. */
export async function renameDomain(repos: Repos, before: Entry, after: Entry) {
  if (before.name === after.name) return;
  for (const { section, domain } of domainSections()) {
    const repo = repos.get(section.key)!;
    for (const entry of await repo.list()) {
      const names = items(entry[domain.key]);
      if (names.some((n) => orgKey(n) === orgKey(before.name))) {
        await repo.update(entry.id, { [domain.key]: splitList(names.map((n) => (orgKey(n) === orgKey(before.name) ? after.name : n)).join(',')).join(', ') });
      }
    }
  }
}

/**
 * Fill an empty Domains page: the built-in domains and subdomains, then those already used on entries. Run when
 * the tab is first created; after that the page is the user's to edit, even down to nothing.
 */
export async function seedDomains(repos: Repos) {
  const repo = repos.get(DOMAIN_LIST)!;
  if ((await repo.list()).length) return;
  const rows = new Map<string, { name: string; subdomains: Map<string, string> }>();
  const add = (domain: string, sub = '') => {
    const name = tidy(domain);
    if (!name) return;
    const row = rows.get(orgKey(name)) ?? { name, subdomains: new Map() };
    rows.set(orgKey(name), row);
    const s = tidy(sub).replace(/,/g, ' ');
    if (s && !row.subdomains.has(orgKey(s))) row.subdomains.set(orgKey(s), s);
  };
  for (const d of DOMAINS) add(d);
  for (const [d, subs] of Object.entries(SUBDOMAINS)) for (const s of subs) add(d, s);
  for (const { section, domain, subdomain } of domainSections()) {
    for (const e of await repos.get(section.key)!.list()) {
      const [first, ...others] = items(e[domain.key]);
      for (const d of others) add(d);
      if (first) for (const s of subdomain ? ['', ...items(e[subdomain.key])] : ['']) add(first, s);
    }
  }
  for (const { name, subdomains } of rows.values()) await repo.create({ name, subdomains: [...subdomains.values()].join(', ') });
}

/**
 * Move the Thai typed on entries (domain_th, subdomain_th: from when each entry had one domain and its own Thai) to
 * the Domains page, where it now lives, then clear it on the entries so this runs once. Thai already on the page wins.
 */
export async function migrateDomainThai(repos: Repos) {
  const repo = repos.get(DOMAIN_LIST)!;
  for (const { section, domain, subdomain } of domainSections()) {
    const entryRepo = repos.get(section.key)!;
    const entries = (await entryRepo.list()).filter((e) => e[translationKey(domain.key, 'th')]?.trim() || (subdomain && e[translationKey(subdomain.key, 'th')]?.trim()));
    if (!entries.length) continue;
    const domainThai = suggestionThai(domain, entries);
    const subThai = subdomain ? suggestionThai(subdomain, entries) : new Map<string, string>();
    for (const row of await repo.list()) {
      const changes: Record<string, string> = {};
      const name = domainThai.get(orgKey(row.name));
      if (name && !row.name_th?.trim()) changes.name_th = name;
      const subs = items(row.subdomains);
      const thai = itemThai(row.subdomains_th);
      for (const s of subs) if (!thai.has(orgKey(s)) && subThai.has(orgKey(s))) thai.set(orgKey(s), subThai.get(orgKey(s))!);
      const pairs = joinItemThai(subs, thai);
      if (pairs !== (row.subdomains_th ?? '')) changes.subdomains_th = pairs;
      if (Object.keys(changes).length) await repo.update(row.id, changes);
    }
    for (const e of entries) await entryRepo.update(e.id, { [translationKey(domain.key, 'th')]: '', ...(subdomain && { [translationKey(subdomain.key, 'th')]: '' }) });
  }
}

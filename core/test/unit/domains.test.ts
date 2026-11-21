import { beforeEach, describe, expect, it } from 'vitest';
import { DOMAIN_LIST, getSection, type Entry } from '@profile/shared';
import { assertUniqueDomain, registerDomains, renameDomain, seedDomains } from '../../src/domains';
import { memoryRepos } from '../helpers/memoryRepos';

const projects = getSection('projects')!;
const activities = getSection('activities')!;

describe('domains', () => {
  let repos: ReturnType<typeof memoryRepos>;
  const rows = async () => (await repos.get(DOMAIN_LIST)!.list()).map((d): [string, string] => [d.name, d.subdomains ?? '']);
  beforeEach(() => {
    repos = memoryRepos();
  });

  it('adds a new domain and subdomain typed on an entry, each once', async () => {
    await repos.get(DOMAIN_LIST)!.create({ name: 'Engineering', subdomains: 'DevOps' });
    await registerDomains(repos, projects, { name: 'Site', domain: 'engineering ', subdomain: 'Web  Development' });
    await registerDomains(repos, activities, { name: 'Talk', domain: 'Engineering', subdomain: 'devops' });
    await registerDomains(repos, activities, { name: 'Fern', domain: 'Biology', subdomain: 'Plant' });
    expect(await rows()).toEqual([
      ['Engineering', 'DevOps, Web Development'],
      ['Biology', 'Plant'],
    ]);
  });

  it("doesn't bring back one deleted from the page when an old entry is saved again unchanged", async () => {
    const before = { id: 'p1', name: 'Site', domain: 'Film', subdomain: 'Editing', createdAt: '', updatedAt: '' } as Entry;
    await registerDomains(repos, projects, { ...before, name: 'Site 2' }, before);
    expect(await rows()).toEqual([]);
    // A subdomain newly picked does count, with its domain.
    await registerDomains(repos, projects, { ...before, subdomain: 'Sound' }, before);
    expect(await rows()).toEqual([['Film', 'Sound']]);
  });

  it('counts a draft being saved for real as new', async () => {
    const draft = { id: 'p1', name: 'Site', domain: 'Film', draft: 'true', createdAt: '', updatedAt: '' } as Entry;
    await registerDomains(repos, projects, { ...draft, draft: '' }, draft);
    expect(await rows()).toEqual([['Film', '']]);
  });

  it('renames the domain on every project and activity', async () => {
    const p = await repos.get('projects')!.create({ name: 'Site', domain: 'engineering' });
    const a = await repos.get('activities')!.create({ name: 'Talk', domain: 'Film' });
    const row = await repos.get(DOMAIN_LIST)!.create({ name: 'Engineering' });
    await renameDomain(repos, row, { ...row, name: 'Software' });
    expect((await repos.get('projects')!.get(p.id)).domain).toBe('Software');
    expect((await repos.get('activities')!.get(a.id)).domain).toBe('Film');
  });

  it('rejects a duplicate domain name but allows keeping your own', async () => {
    const row = await repos.get(DOMAIN_LIST)!.create({ name: 'Film' });
    await expect(assertUniqueDomain(repos, 'FILM')).rejects.toMatchObject({ status: 400, fields: { name: '"Film" already exists' } });
    await expect(assertUniqueDomain(repos, 'Film', row.id)).resolves.toBeUndefined();
  });

  it('starts with the built-in lists and those already used, and only when empty', async () => {
    await repos.get('projects')!.create({ name: 'Tank', domain: 'Exotic pet' });
    await repos.get('activities')!.create({ name: 'Hike', domain: 'nature', subdomain: 'Birds' });
    await seedDomains(repos);
    const seeded = new Map(await rows());
    expect(seeded.get('Engineering')).toContain('DevOps');
    expect(seeded.get('Biology')).toContain('Exotic pet');
    expect(seeded.get('Nature')).toBe('Birds');
    expect(seeded.get('Exotic pet')).toBe('');

    await repos.get(DOMAIN_LIST)!.remove((await repos.get(DOMAIN_LIST)!.list())[0].id);
    const count = (await rows()).length;
    await seedDomains(repos);
    expect((await rows()).length).toBe(count);
  });
});

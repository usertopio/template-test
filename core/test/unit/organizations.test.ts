import { beforeEach, describe, expect, it } from 'vitest';
import { ORGANIZATIONS, getSection } from '@profile/shared';
import { assertUniqueOrganization, backfillOrganizations, registerOrganizations, renameOrganization } from '../../src/organizations';
import { memoryRepos, names } from '../helpers/memoryRepos';

const projects = getSection('projects')!;
const certifications = getSection('certifications')!;

describe('organizations', () => {
  let repos: ReturnType<typeof memoryRepos>;
  beforeEach(() => {
    repos = memoryRepos();
  });

  it('registers a new organization with the type of the field that named it', async () => {
    await registerOrganizations(repos, certifications, { name: 'AWS SA', issuer: '  Amazon   Web Services ' });
    const [org] = await repos.get(ORGANIZATIONS)!.list();
    expect(org).toMatchObject({ name: 'Amazon Web Services', type: 'Certification issuer' });
  });

  it('registers organizations named by projects as "Other"', async () => {
    await registerOrganizations(repos, projects, { name: 'Film', organization: 'Studio X' });
    expect((await repos.get(ORGANIZATIONS)!.list())[0]).toMatchObject({ name: 'Studio X', type: 'Other' });
  });

  it('skips organizations that already exist, ignoring case and spacing', async () => {
    await repos.get(ORGANIZATIONS)!.create({ name: 'Studio X', type: 'Company' });
    await registerOrganizations(repos, projects, { name: 'Film', organization: 'studio  x' });
    expect(await names(repos, ORGANIZATIONS)).toEqual(['Studio X']);
  });

  it('does nothing when the organization field is empty', async () => {
    await registerOrganizations(repos, projects, { name: 'Film', organization: '  ' });
    expect(await names(repos, ORGANIZATIONS)).toEqual([]);
  });

  it('backfills organizations from existing entries once each', async () => {
    await repos.get('experience')!.create({ title: 'Editor', company: 'Studio X' });
    await repos.get('projects')!.create({ name: 'Film', organization: 'STUDIO X' });
    await repos.get('education')!.create({ school: 'Film School' });
    await backfillOrganizations(repos);
    expect(await names(repos, ORGANIZATIONS)).toEqual(['Studio X', 'Film School']);
  });

  it('rejects a duplicate name but allows keeping your own', async () => {
    const org = await repos.get(ORGANIZATIONS)!.create({ name: 'Studio X' });
    await expect(assertUniqueOrganization(repos, ' studio x ')).rejects.toMatchObject({ status: 400, fields: { name: '"Studio X" already exists' } });
    await expect(assertUniqueOrganization(repos, 'Studio X', org.id)).resolves.toBeUndefined();
  });

  it('renames the organization in every entry that uses it', async () => {
    const exp = await repos.get('experience')!.create({ title: 'Editor', company: 'studio x' });
    const cert = await repos.get('certifications')!.create({ name: 'Cert', issuer: 'Other Org' });
    const before = await repos.get(ORGANIZATIONS)!.create({ name: 'Studio X' });
    await renameOrganization(repos, before, { ...before, name: 'Studio Y' });
    expect((await repos.get('experience')!.get(exp.id)).company).toBe('Studio Y');
    expect((await repos.get('certifications')!.get(cert.id)).issuer).toBe('Other Org');
  });
});

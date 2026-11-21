import { beforeEach, describe, expect, it } from 'vitest';
import { LOCATION_LIST, getSection, type Entry } from '@profile/shared';
import { assertUniqueLocation, migrateActivityOnline, migrateLocationThai, registerLocation, renameLocation, seedLocations } from '../../src/locations';
import { memoryRepos, names } from '../helpers/memoryRepos';

const activities = getSection('activities')!;

describe('locations', () => {
  let repos: ReturnType<typeof memoryRepos>;
  beforeEach(() => {
    repos = memoryRepos();
  });

  it('adds a new place named on an entry, once', async () => {
    await registerLocation(repos, activities, { name: 'Talk', location: 'Bangkok ' });
    await registerLocation(repos, getSection('experience')!, { title: 'Dev', location: 'bangkok' });
    expect(await names(repos, LOCATION_LIST)).toEqual(['Bangkok']);
  });

  it("doesn't bring back one deleted from the page when an old entry is saved again unchanged", async () => {
    const before = { id: 'a1', name: 'Talk', location: 'Phuket', createdAt: '', updatedAt: '' } as Entry;
    await registerLocation(repos, activities, { ...before, name: 'Talk 2' }, before);
    expect(await names(repos, LOCATION_LIST)).toEqual([]);
  });

  it('renames the place on every entry there', async () => {
    const a = await repos.get('activities')!.create({ name: 'Talk', location: 'bkk' });
    const o = await repos.get('organizations')!.create({ name: 'X', location: 'BKK' });
    const row = await repos.get(LOCATION_LIST)!.create({ name: 'BKK' });
    await renameLocation(repos, row, { ...row, name: 'Bangkok' });
    expect((await repos.get('activities')!.get(a.id)).location).toBe('Bangkok');
    expect((await repos.get('organizations')!.get(o.id)).location).toBe('Bangkok');
  });

  it('rejects a duplicate place but allows keeping your own', async () => {
    const row = await repos.get(LOCATION_LIST)!.create({ name: 'Bangkok' });
    await expect(assertUniqueLocation(repos, 'BANGKOK')).rejects.toMatchObject({ status: 400 });
    await expect(assertUniqueLocation(repos, 'Bangkok', row.id)).resolves.toBeUndefined();
  });

  it('starts with the places already named, only when empty', async () => {
    await repos.get('activities')!.create({ name: 'Talk', location: 'bangkok' });
    await repos.get('experience')!.create({ title: 'Dev', location: 'Bangkok' });
    await repos.get('organizations')!.create({ name: 'X', location: 'Chiang Mai' });
    await seedLocations(repos);
    expect(await names(repos, LOCATION_LIST)).toEqual(['Bangkok', 'Chiang Mai']);
    await seedLocations(repos);
    expect(await names(repos, LOCATION_LIST)).toEqual(['Bangkok', 'Chiang Mai']);
  });

  it('moves the Thai typed on entries to the Locations page once, keeping Thai already there', async () => {
    const page = repos.get(LOCATION_LIST)!;
    await page.create({ name: 'Bangkok' });
    await page.create({ name: 'Phuket', name_th: 'ภูเก็ต' });
    const a = await repos.get('activities')!.create({ name: 'Talk', location: 'Bangkok', location_th: 'กรุงเทพฯ' });
    await repos.get('activities')!.create({ name: 'Dive', location: 'Phuket', location_th: 'เกาะภูเก็ต' });
    await migrateLocationThai(repos);
    expect((await page.list()).map((l) => l.name_th)).toEqual(['กรุงเทพฯ', 'ภูเก็ต']);
    expect((await repos.get('activities')!.get(a.id)).location_th).toBe('');
  });

  it("turns an activity's old Online tick into a location type, Hybrid with a place, once", async () => {
    const repo = repos.get('activities')!;
    const webinar = await repo.create({ name: 'Webinar', online: 'true' });
    const fair = await repo.create({ name: 'Fair', location: 'Bangkok', online: 'true' });
    const set = await repo.create({ name: 'Set', online: 'true', locationType: 'Onsite' });
    const meetup = await repo.create({ name: 'Meetup', location: 'Bangkok', online: 'false' });
    await migrateActivityOnline(repos);
    const after = async (id: string) => {
      const e = await repo.get(id);
      return [e.locationType ?? '', e.online];
    };
    expect(await after(webinar.id)).toEqual(['Online', '']);
    expect(await after(fair.id)).toEqual(['Hybrid', '']);
    expect(await after(set.id)).toEqual(['Onsite', '']);
    expect(await after(meetup.id)).toEqual(['', 'false']);
  });
});

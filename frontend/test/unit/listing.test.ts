import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSection, type Entry, type MediaItem } from '@profile/shared';
import { FILTER_SEP, applyListing, defaultSort, filterOptions, filterValueOf, sortOptions, uniqueTags, type ListingState } from '../../src/listing';

const projects = getSection('projects')!;
const posts = getSection('posts')!;
const activities = getSection('activities')!;

let n = 0;
const entry = (data: Record<string, string>): Entry => ({ id: `e${++n}`, createdAt: `2026-01-0${n}`, updatedAt: `2026-01-0${n}`, ...data });
const state = (s: Partial<ListingState> = {}): ListingState => ({ q: '', sort: '', dir: 'desc', filters: {}, ...s });
const titles = (entries: Entry[]) => entries.map((e) => e.name ?? e.title);

beforeEach(() => {
  n = 0;
  vi.useFakeTimers({ now: new Date('2026-06-15'), toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('uniqueTags', () => {
  it('de-duplicates case-insensitively, keeping the first spelling, and sorts', () => {
    expect(uniqueTags(['react', 'Go', 'React', 'apple'])).toEqual(['apple', 'Go', 'react']);
  });
});

describe('sort options', () => {
  it('defaults to the first date field, or the configured one', () => {
    expect(defaultSort(projects).id).toBe('startDate');
    expect(defaultSort(posts).id).toBe('createdAt');
  });

  it('offers duration only for sections with a date range', () => {
    expect(sortOptions(projects).map((o) => o.id)).toContain('duration');
    expect(sortOptions(posts).map((o) => o.id)).not.toContain('duration');
  });
});

describe('applyListing', () => {
  const items = () => [
    entry({ name: 'Short film', startDate: '2024-03', skills: 'Editing, Sound', description: 'A documentary' }),
    entry({ name: 'Website', startDate: '2025-01', endDate: '2025-02', skills: 'React' }),
    entry({ name: 'Undated idea' }),
  ];

  it('sorts by date, newest first, with empty values last in either direction', () => {
    expect(titles(applyListing(projects, items(), state()))).toEqual(['Website', 'Short film', 'Undated idea']);
    expect(titles(applyListing(projects, items(), state({ dir: 'asc' })))).toEqual(['Short film', 'Website', 'Undated idea']);
  });

  it('sorts by title and by duration (ongoing projects run until today)', () => {
    expect(titles(applyListing(projects, items(), state({ sort: 'title', dir: 'asc' })))).toEqual(['Short film', 'Undated idea', 'Website']);
    expect(titles(applyListing(projects, items(), state({ sort: 'duration' })))[0]).toBe('Short film');
  });

  it('searches every text field; all words must match', () => {
    expect(titles(applyListing(projects, items(), state({ q: 'DOCUMENTARY' })))).toEqual(['Short film']);
    expect(titles(applyListing(projects, items(), state({ q: 'film react' })))).toEqual([]);
  });

  it('filters by tag, case-insensitively', () => {
    const data = items();
    const skills = filterOptions(projects, data).find((f) => f.key === 'skills')!;
    expect(skills.options.map((o) => o.label)).toEqual(['Editing', 'React', 'Sound']);
    expect(titles(applyListing(projects, data, state({ filters: { skills: 'react' } })))).toEqual(['Website']);
  });

  it('filters by year, counting every year a project was running', () => {
    const data = items();
    const year = filterOptions(projects, data).find((f) => f.key === 'year')!;
    expect(year.options.map((o) => o.value)).toEqual(['2026', '2025', '2024']);
    expect(titles(applyListing(projects, data, state({ filters: { year: '2025' } })))).toEqual(['Website', 'Short film']);
  });

  it('counts only the start year of an entry with "No end date", and gives it no duration', () => {
    const data = [entry({ name: 'Screening', startDate: '2024-05', noEndDate: 'true' }), entry({ name: 'Series', startDate: '2025-01' })];
    expect(titles(applyListing(projects, data, state({ filters: { year: '2026' } })))).toEqual(['Series']);
    expect(titles(applyListing(projects, data, state({ filters: { year: '2024' } })))).toEqual(['Screening']);
    expect(titles(applyListing(projects, data, state({ sort: 'duration' })))).toEqual(['Series', 'Screening']);
  });

  it('filters by category, offering only the categories in use', () => {
    const data = [entry({ name: 'Talk', category: 'Seminar' }), entry({ name: 'Course', category: 'training' }), entry({ name: 'Other' })];
    const category = filterOptions(activities, data).find((f) => f.key === 'category')!;
    expect(category.options.map((o) => o.label)).toEqual(['Seminar', 'training']);
    expect(titles(applyListing(activities, data, state({ filters: { category: 'seminar' } })))).toEqual(['Talk']);
  });

  it('treats an empty select cell as its default when filtering', () => {
    const data = [entry({ title: 'Old post' }), entry({ title: 'Live', status: 'posted' })];
    expect(titles(applyListing(posts, data, state({ filters: { status: 'draft' } })))).toEqual(['Old post']);
  });
});

describe('more filters', () => {
  const options = (section: string, data: Entry[], key: string) => filterOptions(getSection(section)!, data).find((f) => f.key === key);

  it('filters by organization, matching names typed with different case or spacing', () => {
    const data = [entry({ name: 'A', organization: 'Depa' }), entry({ name: 'B', organization: ' DEPA  ' }), entry({ name: 'C', organization: 'Other  Org' })];
    expect(options('projects', data, 'organization')!.options.map((o) => o.label)).toEqual(['Depa', 'Other Org']);
    expect(titles(applyListing(projects, data, state({ filters: { organization: 'depa' } })))).toEqual(['A', 'B']);
  });

  it('lists each of several organizations once, and finds an entry under any of them', () => {
    const data = [entry({ name: 'A', organization: 'Studio X; Acme' }), entry({ name: 'B', organization: 'acme' })];
    expect(options('projects', data, 'organization')!.options.map((o) => o.label)).toEqual(['Acme', 'Studio X']);
    expect(titles(applyListing(projects, data, state({ filters: { organization: 'acme' } })))).toEqual(['A', 'B']);
    expect(titles(applyListing(projects, data, state({ filters: { organization: 'studio x' } })))).toEqual(['A']);
  });

  it('filters activities by location type, among the details rather than the dates', () => {
    const data = [entry({ name: 'Webinar', locationType: 'Online' }), entry({ name: 'Expo', location: 'Bangkok', locationType: 'Hybrid' }), entry({ name: 'Meetup', locationType: 'Onsite' })];
    const filter = options('activities', data, 'locationType');
    expect(filter?.group).toBe('Details');
    expect(filter?.options.map((o) => o.label)).toEqual(['Onsite', 'Online', 'Hybrid']);
    expect(titles(applyListing(activities, data, state({ filters: { locationType: 'Hybrid' } })))).toEqual(['Expo']);
    expect(titles(applyListing(activities, data, state({ filters: { locationType: 'Online' } })))).toEqual(['Webinar']);
  });

  it("gives the filter value a card's value picks, matching the filter's own options", () => {
    const field = (key: string) => activities.fields.find((f) => f.key === key)!;
    const data = [entry({ name: 'A', subdomain: 'AI & Data', location: 'Bangkok  Hall', organizer: 'Fibo', skills: 'Docker', locationType: 'Hybrid' })];
    for (const [key, value] of [['subdomain', 'AI & Data'], ['location', 'Bangkok  Hall'], ['organizer', 'Fibo'], ['skills', 'Docker'], ['locationType', 'Hybrid']]) {
      const picked = filterValueOf(field(key), value);
      expect(options('activities', data, key)!.options.map((o) => o.value)).toContain(picked);
      expect(titles(applyListing(activities, data, state({ filters: { [key]: picked! } })))).toEqual(['A']);
    }
    expect(filterValueOf(field('description'), 'Hi')).toBeNull();
    expect(filterValueOf(field('location'), ' ')).toBeNull();
  });

  it('filters experience by whether it was online', () => {
    const data = [entry({ title: 'Remote dev', online: 'true' }), entry({ title: 'Editor' })];
    expect(options('experience', data, 'online')?.group).toBe('Details');
    expect(applyListing(getSection('experience')!, data, state({ filters: { online: 'true' } })).map((e) => e.title)).toEqual(['Remote dev']);
  });

  it('filters by fields marked filter, like a role or a skill category, offering only the values in use', () => {
    const data = [entry({ name: 'A', role: 'Director' }), entry({ name: 'B' })];
    expect(options('projects', data, 'role')!.options.map((o) => o.label)).toEqual(['Director']);
    expect(options('projects', [entry({ name: 'B' })], 'role')).toBeUndefined();
    expect(options('skills', [entry({ name: 'Editing', category: 'Film' })], 'category')!.options.map((o) => o.label)).toEqual(['Film']);
    // A unique value per entry isn't worth a filter.
    expect(options('certificates', [entry({ name: 'X', credentialId: 'ABC' })], 'credentialId')).toBeUndefined();
  });

  it('filters by whether an entry has a certification, and a certificate, each on its own', () => {
    const data = [entry({ name: 'A', certificationIds: 'c1' }), entry({ name: 'B', certificateIds: 'c2' }), entry({ name: 'C' })];
    const certifications = options('projects', data, 'certificationIds')!;
    expect([certifications.label, certifications.group, certifications.options.map((o) => o.label)]).toEqual(['Certifications', 'Progress', ['Has', "Doesn't have"]]);
    expect(titles(applyListing(projects, data, state({ filters: { certificateIds: 'has' } })))).toEqual(['B']);
    expect(titles(applyListing(projects, data, state({ filters: { certificateIds: 'none' } })))).toEqual(['A', 'C']);
    // Both: neither yet.
    expect(titles(applyListing(projects, data, state({ filters: { certificationIds: 'none', certificateIds: 'none' } })))).toEqual(['C']);
    // Offered once some entry has one; they aren't under Linked.
    expect(options('projects', [entry({ name: 'C' })], 'certificationIds')).toBeUndefined();
    expect(options('projects', data, 'linked')).toBeUndefined();
  });

  it("filters by what an activity or a post links to, or nothing, a post's certificates too", () => {
    const data = [entry({ name: 'A', projectIds: 'p1', certificateIds: 'c1' }), entry({ name: 'B' })];
    expect(options('activities', data, 'linked')!.options.map((o) => o.label)).toEqual(['Projects', 'Nothing']);
    expect(titles(applyListing(activities, data, state({ filters: { linked: 'none' } })))).toEqual(['B']);
    const post = [entry({ title: 'P', certificateIds: 'c1' })];
    expect(options('posts', post, 'linked')!.options.map((o) => o.label)).toEqual(['Certificates', 'Nothing']);
    expect(options('posts', post, 'certificateIds')).toBeUndefined();
  });

  it('filters by whether a post links the entry yet', () => {
    const volunteer = getSection('volunteer')!;
    const data = [entry({ role: 'Camera' }), entry({ role: 'Driver' })];
    const linkers = new Map([['posts', [entry({ title: 'Thanks', volunteerIds: data[0].id, projectIds: data[1].id })]]]);
    expect(filterOptions(volunteer, data, linkers).find((f) => f.key === 'posts')!.options.map((o) => o.label)).toEqual(['In a post', 'Not in a post yet']);
    const roles = (v: string) => applyListing(volunteer, data, state({ filters: { posts: v } }), 'en', linkers).map((e) => e.role);
    expect(roles('linked')).toEqual(['Camera']);
    expect(roles('none')).toEqual(['Driver']);
    // Without the posts loaded, no such filter.
    expect(filterOptions(volunteer, data).some((f) => f.key === 'posts')).toBe(false);
  });

  it('filters by whether an activity links the entry yet', () => {
    const data = [entry({ name: 'Film' }), entry({ name: 'Robot' })];
    const linkers = new Map([['activities', [entry({ name: 'Workshop', projectIds: data[1].id })]]]);
    expect(filterOptions(projects, data, linkers).find((f) => f.key === 'activities')!.options.map((o) => o.label)).toEqual(['In an activity', 'Not in an activity yet']);
    expect(titles(applyListing(projects, data, state({ filters: { activities: 'linked' } }), 'en', linkers))).toEqual(['Robot']);
  });

  it('filters organizations by whether a sign-up email is noted, leaving out ones with no sites', () => {
    const orgs = getSection('organizations')!;
    const data = [
      entry({ name: 'Chula', links: 'MOOC | https://a.test | me@example.com\nSnap | https://b.test' }),
      entry({ name: 'CMU', website: 'https://c.test', websiteEmail: 'me@example.com' }),
      entry({ name: '9Expert', website: 'https://d.test' }),
      entry({ name: 'Issuer' }),
    ];
    expect(titles(applyListing(orgs, data, state({ filters: { signUpEmail: 'has' } })))).toEqual(['CMU', 'Chula']);
    expect(titles(applyListing(orgs, data, state({ filters: { signUpEmail: 'none' } })))).toEqual(['9Expert']);
    expect(options('organizations', data, 'signUpEmail')!.options.map((o) => o.label)).toEqual(['Has a sign-up email', 'No sign-up email yet']);
    // Only where there's a site to note one for.
    expect(options('organizations', [entry({ name: 'Issuer' })], 'signUpEmail')).toBeUndefined();
    expect(options('projects', data, 'signUpEmail')).toBeUndefined();
  });

  it('filters certificates by expiration, valid through the expiry date itself', () => {
    const certificates = getSection('certificates')!;
    const data = [entry({ name: 'Old', expiryDate: '2026-06-14' }), entry({ name: 'Today', expiryDate: '2026-06-15' }), entry({ name: 'Forever' })];
    expect(titles(applyListing(certificates, data, state({ filters: { expiry: 'expired' } })))).toEqual(['Old']);
    expect(titles(applyListing(certificates, data, state({ filters: { expiry: 'valid' } })))).toEqual(['Today']);
    expect(titles(applyListing(certificates, data, state({ filters: { expiry: 'none' } })))).toEqual(['Forever']);
    expect(options('projects', data, 'expiry')).toBeUndefined();
  });

  it('counts "No expiration date" as no expiration, with no Yes/No filter of its own', () => {
    const certificates = getSection('certificates')!;
    const data = [entry({ name: 'Forever', noExpiryDate: 'true' }), entry({ name: 'Unknown' })];
    expect(titles(applyListing(certificates, data, state({ filters: { expiry: 'none' } })))).toEqual(['Forever', 'Unknown']);
    expect(options('certificates', data, 'noExpiryDate')).toBeUndefined();
  });

  it("filters activities by progress, worked out from the dates unless it's set by hand", () => {
    const data = [
      entry({ name: 'Next', startDate: '2026-07-01', endDate: '2026-07-02' }),
      entry({ name: 'Now', startDate: '2026-06-14', endDate: '2026-06-15' }),
      entry({ name: 'Past', startDate: '2026-06-01', noEndDate: 'true' }),
      entry({ name: 'Off', startDate: '2026-07-01', progress: 'Cancelled by Applicant' }),
      entry({ name: 'Open', applicationDeadline: '2026-06-20', startDate: '2026-07-01' }),
      entry({ name: 'Undated' }),
    ];
    const filter = options('activities', data, 'progress')!;
    expect(filter.group).toBe('Progress');
    // Only what entries have, in the fixed order; Rejected isn't used.
    expect(filter.options.map((o) => o.label)).toEqual(['Interested', 'Not Started', 'In Progress', 'Completed', 'Cancelled by Applicant']);
    expect(titles(applyListing(activities, data, state({ filters: { progress: 'Not Started' } })))).toEqual(['Next']);
    expect(titles(applyListing(activities, data, state({ filters: { progress: `Completed${FILTER_SEP}Cancelled by Applicant` } })))).toEqual(['Off', 'Past']);
  });

  it('filters by whether an entry has files, once some entry has one', () => {
    const data = [entry({ name: 'Shots' }), entry({ name: 'Bare' })];
    const media = [{ id: 'm1', entryId: data[0].id } as MediaItem];
    expect(filterOptions(projects, data, new Map(), [])).not.toContainEqual(expect.objectContaining({ key: 'media' }));
    expect(filterOptions(projects, data, new Map(), media).find((f) => f.key === 'media')?.group).toBe('Progress');
    expect(titles(applyListing(projects, data, state({ filters: { media: 'has' } }), 'en', new Map(), media))).toEqual(['Shots']);
    expect(titles(applyListing(projects, data, state({ filters: { media: 'none' } }), 'en', new Map(), media))).toEqual(['Bare']);
    // An organization's logo isn't a file of its own.
    expect(filterOptions(getSection('organizations')!, data, new Map(), media)).not.toContainEqual(expect.objectContaining({ key: 'media' }));
  });

  it('filters by whether the Thai version is missing', () => {
    const data = [entry({ name: 'Done', name_th: 'เสร็จ' }), entry({ name: 'Half', name_th: 'ครึ่ง', role: 'Editor' }), entry({ name: 'None' })];
    expect(titles(applyListing(projects, data, state({ filters: { thai: 'missing' } })))).toEqual(['Half', 'None']);
    expect(titles(applyListing(projects, data, state({ filters: { thai: 'done' } })))).toEqual(['Done']);
  });
});

describe('draft filter', () => {
  it('appears once there are drafts, and splits drafts from saved entries', () => {
    const projects = getSection('projects')!;
    const saved = { id: '1', name: 'Saved', createdAt: '', updatedAt: '' } as Entry;
    const draft = { id: '2', name: 'Draft', draft: 'true', createdAt: '', updatedAt: '' } as Entry;
    expect(filterOptions(projects, [saved]).some((f) => f.key === 'status')).toBe(false);
    const status = filterOptions(projects, [saved, draft]).find((f) => f.key === 'status')!;
    expect(status.options.map((o) => o.label)).toEqual(['Drafts', 'Saved']);
    expect([saved, draft].filter((e) => status.matches(e, 'draft')).map((e) => e.name)).toEqual(['Draft']);
  });
});

describe('applyListing in Thai', () => {
  const list = () => [entry({ name: 'Alpha', name_th: 'ฮ ภาพยนตร์' }), entry({ name: 'Zulu', name_th: 'ก สารคดี' }), entry({ name: 'Mid' })];

  it('finds an entry by its English or its Thai text', () => {
    expect(titles(applyListing(projects, list(), state({ q: 'สารคดี' })))).toEqual(['Zulu']);
    expect(titles(applyListing(projects, list(), state({ q: 'alpha' }), 'th'))).toEqual(['Alpha']);
  });

  it('sorts names as they are shown', () => {
    expect(titles(applyListing(projects, list(), state({ sort: 'title', dir: 'asc' }), 'en'))).toEqual(['Alpha', 'Mid', 'Zulu']);
    // Untranslated "Mid" sorts by its English name, before the Thai ones.
    expect(titles(applyListing(projects, list(), state({ sort: 'title', dir: 'asc' }), 'th'))).toEqual(['Mid', 'Zulu', 'Alpha']);
  });
});

describe('several values of one filter', () => {
  it('shows entries matching any of them, still narrowed by other filters', () => {
    const list = [
      entry({ name: 'Talk', domain: 'Engineering', category: 'Seminar' }),
      entry({ name: 'Screening', domain: 'Film', category: 'Meetup' }),
      entry({ name: 'Hike', domain: 'Nature', category: 'Meetup' }),
    ];
    const value = (key: string, label: string) => filterOptions(activities, list).find((f) => f.key === key)!.options.find((o) => o.label === label)!.value;
    const both = [value('domain', 'Engineering'), value('domain', 'Film')].join(FILTER_SEP);
    expect(titles(applyListing(activities, list, state({ sort: 'title', dir: 'asc', filters: { domain: both } })))).toEqual(['Screening', 'Talk']);
    expect(titles(applyListing(activities, list, state({ filters: { domain: both, category: value('category', 'Meetup') } })))).toEqual(['Screening']);
  });
});

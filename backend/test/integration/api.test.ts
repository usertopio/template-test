// The real Express app (routes, validation, auth, linking) over HTTP, with in-memory tabs instead of Google Sheets.
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORGANIZATIONS, SKILLS } from '@profile/shared';
import { ConfigError, createApp } from '../../src/app';
import { MemoryFileStore, memoryRepos, names } from '@profile/core/testing';

let repos: ReturnType<typeof memoryRepos>;
let files: MemoryFileStore;
let api: ReturnType<typeof request>;

beforeEach(() => {
  vi.stubEnv('APP_PASSWORD', '');
  vi.stubEnv('NODE_ENV', 'test');
  repos = memoryRepos();
  files = new MemoryFileStore();
  api = request(
    createApp(
      async () => repos,
      async () => files,
    ),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('health', () => {
  it('is ok when the sheet is reachable', async () => {
    await api.get('/api/health').expect(200, { ok: true, media: { ok: true } });
  });

  it('explains a configuration problem with 503', async () => {
    const broken = request(
      createApp(
        async () => {
          throw new ConfigError('GOOGLE_SHEET_ID is not set');
        },
        async () => files,
      ),
    );
    await broken.get('/api/health').expect(503, { ok: false, error: 'GOOGLE_SHEET_ID is not set' });
  });
});

describe('list sections CRUD', () => {
  it('creates, reads, updates, lists and deletes an entry', async () => {
    const created = await api.post('/api/sections/skills').send({ name: 'React', category: 'Engineering' }).expect(201);
    expect(created.body).toMatchObject({ name: 'React', category: 'Engineering', endorsementNote: '' });
    const id = created.body.id;

    await api.get(`/api/sections/skills/${id}`).expect(200).expect((res) => expect(res.body.name).toBe('React'));
    await api.put(`/api/sections/skills/${id}`).send({ name: 'React', category: 'Frontend' }).expect(200);
    const list = await api.get('/api/sections/skills').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].category).toBe('Frontend');

    await api.delete(`/api/sections/skills/${id}`).expect(204);
    await api.get(`/api/sections/skills/${id}`).expect(404);
  });

  it('returns field errors for invalid input', async () => {
    const res = await api.post('/api/sections/projects').send({ name: '', url: 'nope' }).expect(400);
    expect(res.body).toEqual({ error: 'Validation failed', fields: { name: 'Project name is required', url: 'Must be a valid URL, e.g. https://example.com' } });
  });

  it('404s unknown sections and treats singleton and list routes separately', async () => {
    await api.get('/api/sections/unknown').expect(404);
    await api.get('/api/sections/about').expect(404);
    await api.get('/api/single/skills').expect(404);
    await api.get('/api/nothing-here').expect(404, { error: 'Not found' });
  });
});

describe('About (singleton)', () => {
  it('starts empty, then upserts a single row', async () => {
    await api.get('/api/single/about').expect(200).expect((res) => expect(res.body).toBeNull());
    await api.put('/api/single/about').send({ name: 'Parzival' }).expect(200);
    await api.put('/api/single/about').send({ name: 'Parzival', headline: 'Filmmaker' }).expect(200);
    expect(await repos.get('about')!.list()).toHaveLength(1);
    await api.get('/api/single/about').expect((res) => expect(res.body).toMatchObject({ name: 'Parzival', headline: 'Filmmaker' }));
  });
});

describe('linking certifications', () => {
  it('drops ids of certifications that do not exist', async () => {
    const cert = (await api.post('/api/sections/certifications').send({ name: 'AWS', issuer: 'Amazon' })).body;
    const project = await api.post('/api/sections/projects').send({ name: 'App', certificationIds: `${cert.id},ghost` }).expect(201);
    expect(project.body.certificationIds).toBe(cert.id);
  });

  it('unlinks one certification from one entry, keeping the rest of it', async () => {
    const a = (await api.post('/api/sections/certifications').send({ name: 'A', issuer: 'X' })).body;
    const b = (await api.post('/api/sections/certifications').send({ name: 'B', issuer: 'X' })).body;
    const exp = (await api.post('/api/sections/experience').send({ title: 'Dev', company: 'X', certificationIds: `${a.id},${b.id}` })).body;
    const res = await api.delete(`/api/sections/experience/${exp.id}/links/certifications/${a.id}`).expect(200);
    expect(res.body).toMatchObject({ title: 'Dev', company: 'X', certificationIds: b.id });
    expect((await repos.get('experience')!.get(exp.id)).certificationIds).toBe(b.id);
    await api.delete(`/api/sections/nope/${exp.id}/links/certifications/${a.id}`).expect(404);
  });

  it('links a certificate from one entry per section, until it is unlinked there', async () => {
    const cert = (await api.post('/api/sections/certificates').send({ name: 'First aid', issuer: 'Red Cross' })).body;
    const vol = (await api.post('/api/sections/volunteer').send({ role: 'Mentor', organization: 'Red Cross', certificateIds: cert.id })).body;
    // Another section may link it too…
    const project = (await api.post('/api/sections/projects').send({ name: 'App', certificateIds: cert.id }).expect(201)).body;
    // …but not a second entry of the same section.
    const refused = await api.post('/api/sections/projects').send({ name: 'Site', certificateIds: cert.id }).expect(409);
    expect(refused.body.fields).toEqual({ certificateIds: '“First aid” is already linked to project “App”. Unlink it there first.' });

    // The entries holding it still save, and posts can still mention it (post links aren't exclusive).
    await api.put(`/api/sections/volunteer/${vol.id}`).send({ ...vol, cause: 'Health' }).expect(200);
    await api.post('/api/sections/posts').send({ title: 'Done', status: 'draft', certificateIds: cert.id }).expect(201);
    await api.post('/api/sections/posts').send({ title: 'Again', status: 'draft', certificateIds: cert.id }).expect(201);

    await api.delete(`/api/sections/projects/${project.id}/links/certificates/${cert.id}`).expect(200);
    await api.post('/api/sections/projects').send({ name: 'Site', certificateIds: cert.id }).expect(201);
  });

  it('lets several entries share a certification', async () => {
    const cert = (await api.post('/api/sections/certifications').send({ name: 'AWS', issuer: 'Amazon' })).body;
    await api.post('/api/sections/projects').send({ name: 'A', certificationIds: cert.id }).expect(201);
    await api.post('/api/sections/projects').send({ name: 'B', certificationIds: cert.id }).expect(201);
  });

  it('unlinks a deleted certification everywhere', async () => {
    const a = (await api.post('/api/sections/certifications').send({ name: 'A', issuer: 'X' })).body;
    const b = (await api.post('/api/sections/certifications').send({ name: 'B', issuer: 'X' })).body;
    const exp = (await api.post('/api/sections/experience').send({ title: 'Dev', company: 'X', certificationIds: `${a.id},${b.id}` })).body;
    await api.delete(`/api/sections/certifications/${a.id}`).expect(204);
    expect((await repos.get('experience')!.get(exp.id)).certificationIds).toBe(b.id);
  });
});

describe('linking posts from an entry', () => {
  const post = async (title: string, data: Record<string, string> = {}) => (await api.post('/api/sections/posts').send({ title, ...data }).expect(201)).body;
  const projectIdsOf = async (id: string) => (await api.get(`/api/sections/posts/${id}`).expect(200)).body.projectIds;

  it("stores the posts picked on a project in the posts' own links, adding and removing just this project", async () => {
    const other = (await api.post('/api/sections/projects').send({ name: 'Other' }).expect(201)).body;
    const a = await post('Launch', { projectIds: other.id });
    const b = await post('Recap');
    const p = (await api.post('/api/sections/projects').send({ name: 'Film', 'linkedFrom:posts': a.id }).expect(201)).body;
    expect(await projectIdsOf(a.id)).toBe(`${other.id},${p.id}`);
    expect(await projectIdsOf(b.id)).toBe('');
    // linkedFrom isn't a column of the project.
    expect(p).not.toHaveProperty('linkedFrom:posts');

    await api.put(`/api/sections/projects/${p.id}`).send({ name: 'Film', 'linkedFrom:posts': b.id }).expect(200);
    expect(await projectIdsOf(a.id)).toBe(other.id);
    expect(await projectIdsOf(b.id)).toBe(p.id);
  });

  it("leaves the posts as they are when the entry is saved without them", async () => {
    const p = (await api.post('/api/sections/projects').send({ name: 'Film' }).expect(201)).body;
    const a = await post('Launch', { projectIds: p.id });
    await api.put(`/api/sections/projects/${p.id}`).send({ name: 'Film 2' }).expect(200);
    expect(await projectIdsOf(a.id)).toBe(p.id);
  });

  it('refuses unknown posts without saving anything', async () => {
    const res = await api.post('/api/sections/projects').send({ name: 'Film', 'linkedFrom:posts': 'nope' }).expect(400);
    expect(res.body.fields).toEqual({ 'linkedFrom:posts': 'No post with the id nope' });
    expect((await api.get('/api/sections/projects')).body).toEqual([]);
  });

  it('works for every section a post links to', async () => {
    const a = await post('Launch');
    const v = (await api.post('/api/sections/volunteer').send({ organization: 'Red Cross', role: 'Camera', 'linkedFrom:posts': a.id }).expect(201)).body;
    expect((await api.get(`/api/sections/posts/${a.id}`)).body.volunteerIds).toBe(v.id);
  });
});

describe('linking an activity to other entries', () => {
  const activity = async (name: string, data: Record<string, string> = {}) => (await api.post('/api/sections/activities').send({ name, ...data }).expect(201)).body;

  it('stores the projects, jobs, schools and volunteer roles on the activity, and unlinks deleted ones', async () => {
    const p = (await api.post('/api/sections/projects').send({ name: 'Film' }).expect(201)).body;
    const x = (await api.post('/api/sections/experience').send({ title: 'Dev', company: 'X' }).expect(201)).body;
    const e = (await api.post('/api/sections/education').send({ school: 'KU' }).expect(201)).body;
    const v = (await api.post('/api/sections/volunteer').send({ organization: 'Red Cross', role: 'Camera' }).expect(201)).body;
    const a = await activity('Workshop', { projectIds: p.id, experienceIds: x.id, educationIds: e.id, volunteerIds: v.id });
    expect(a).toMatchObject({ projectIds: p.id, experienceIds: x.id, educationIds: e.id, volunteerIds: v.id });

    await api.delete(`/api/sections/projects/${p.id}`).expect(204);
    expect((await api.get(`/api/sections/activities/${a.id}`)).body.projectIds).toBe('');
  });

  it("stores the activities picked on a project in the activities' own links", async () => {
    const a = await activity('Workshop');
    const b = await activity('Seminar');
    const p = (await api.post('/api/sections/projects').send({ name: 'Film', 'linkedFrom:activities': `${a.id},${b.id}` }).expect(201)).body;
    expect((await api.get(`/api/sections/activities/${a.id}`)).body.projectIds).toBe(p.id);

    await api.put(`/api/sections/projects/${p.id}`).send({ name: 'Film', 'linkedFrom:activities': b.id }).expect(200);
    expect((await api.get(`/api/sections/activities/${a.id}`)).body.projectIds).toBe('');
    expect((await api.get(`/api/sections/activities/${b.id}`)).body.projectIds).toBe(p.id);
  });
});

describe('the Domains page', () => {
  const domains = async () => (await api.get('/api/sections/domains').expect(200)).body.map((d: Record<string, string>) => [d.name, d.subdomains]);

  it('gains the domain and subdomain typed on an entry, and renames them on entries', async () => {
    const p = (await api.post('/api/sections/projects').send({ name: 'Site', domain: 'Engineering', subdomain: 'DevOps' }).expect(201)).body;
    expect(await domains()).toEqual([['Engineering', 'DevOps']]);
    const [row] = (await api.get('/api/sections/domains')).body;
    await api.put(`/api/sections/domains/${row.id}`).send({ name: 'Software', subdomains: 'DevOps' }).expect(200);
    expect((await api.get(`/api/sections/projects/${p.id}`)).body.domain).toBe('Software');
    await api.post('/api/sections/domains').send({ name: 'software' }).expect(400);
  });

  it("keeps a deleted domain deleted when an entry using it is saved again, and waits for a draft", async () => {
    const p = (await api.post('/api/sections/projects').send({ name: 'Site', domain: 'Film' }).expect(201)).body;
    const [row] = (await api.get('/api/sections/domains')).body;
    await api.delete(`/api/sections/domains/${row.id}`).expect(204);
    await api.put(`/api/sections/projects/${p.id}`).send({ name: 'Site 2', domain: 'Film' }).expect(200);
    expect((await api.get(`/api/sections/projects/${p.id}`)).body.domain).toBe('Film');
    expect(await domains()).toEqual([]);

    await api.post('/api/sections/activities?draft=1').send({ name: 'Talk', domain: 'Biology' }).expect(201);
    expect(await domains()).toEqual([]);
  });
});

describe('saving an entry of a section without media', () => {
  // Saving one with its title and first subtitle unchanged (e.g. editing a post's text) used to fail after the save,
  // looking for a Drive folder such sections don't have.
  it('answers normally when its title stays the same', async () => {
    const post = (await api.post('/api/sections/posts').send({ title: 'Launch', status: 'draft' }).expect(201)).body;
    const res = await api.put(`/api/sections/posts/${post.id}`).send({ title: 'Launch', status: 'draft', content: 'We shipped.' }).expect(200);
    expect(res.body.content).toBe('We shipped.');
    const skill = (await api.post('/api/sections/skills').send({ name: 'React' }).expect(201)).body;
    await api.put(`/api/sections/skills/${skill.id}`).send({ name: 'React', endorsementNote: 'Daily' }).expect(200);
  });
});

describe('the Locations page', () => {
  it('gains the place named on an entry, and renames it on entries', async () => {
    const a = (await api.post('/api/sections/activities').send({ name: 'Talk', location: 'BKK', locationDetail: 'Hall 2' }).expect(201)).body;
    const [row] = (await api.get('/api/sections/locations').expect(200)).body;
    expect(row.name).toBe('BKK');
    await api.put(`/api/sections/locations/${row.id}`).send({ name: 'Bangkok' }).expect(200);
    expect((await api.get(`/api/sections/activities/${a.id}`)).body).toMatchObject({ location: 'Bangkok', locationDetail: 'Hall 2' });
    await api.post('/api/sections/locations').send({ name: 'bangkok' }).expect(400);
  });
});

describe('Thai of suggested values', () => {
  it('gives the Thai typed with a category to the other activities with that category and no Thai yet', async () => {
    const talk = (await api.post('/api/sections/activities').send({ name: 'Talk', category: 'Seminar' }).expect(201)).body;
    const panel = (await api.post('/api/sections/activities').send({ name: 'Panel', category: 'seminar', category_th: 'สัมมนา' }).expect(201)).body;
    const course = (await api.post('/api/sections/activities').send({ name: 'Course', category: 'Training' }).expect(201)).body;
    // Panel's own Thai came first and filled Talk; a later one doesn't overwrite either.
    await api.post('/api/sections/activities').send({ name: 'Forum', category: 'Seminar', category_th: 'งานสัมมนา' }).expect(201);
    const th = async (id: string) => (await repos.get('activities')!.get(id)).category_th;
    expect(await th(talk.id)).toBe('สัมมนา');
    expect(await th(panel.id)).toBe('สัมมนา');
    expect(await th(course.id)).toBe('');
  });
});

describe('organizations', () => {
  it('adds organizations typed on projects and certifications to the Organizations list', async () => {
    await api.post('/api/sections/projects').send({ name: 'Film', organization: 'Studio X' }).expect(201);
    await api.post('/api/sections/certifications').send({ name: 'AWS', issuer: 'Amazon' }).expect(201);
    await api.post('/api/sections/certifications').send({ name: 'AWS 2', issuer: 'amazon' }).expect(201);
    expect(await names(repos, ORGANIZATIONS)).toEqual(['Studio X', 'Amazon']);
  });

  it("sets an organization's Thai name from an entry's form, adding it if it's new", async () => {
    const org = (await api.post('/api/sections/organizations').send({ name: 'Studio X' }).expect(201)).body;
    const p = (await api.post('/api/sections/projects').send({ name: 'Film', organization: 'studio x', 'organizationThai:studio x': 'สตูดิโอเอ็กซ์' }).expect(201)).body;
    expect((await repos.get(ORGANIZATIONS)!.get(org.id)).name_th).toBe('สตูดิโอเอ็กซ์');
    // Stored on the organization only.
    expect(p).not.toHaveProperty('organizationThai:studio x');

    await api.post('/api/sections/experience').send({ title: 'Editor', company: 'Blue Reef', 'organizationThai:Blue Reef': ' บลู  รีฟ ' }).expect(201);
    const reef = (await repos.get(ORGANIZATIONS)!.list()).find((o) => o.name === 'Blue Reef')!;
    expect(reef).toMatchObject({ type: 'Company', name_th: 'บลู รีฟ' });
  });

  it("adds a draft's organization only when its Thai name is given, and leaves Thai names alone when not sent", async () => {
    await api.post('/api/sections/projects?draft=1').send({ name: 'Idea', organization: 'Later Co' }).expect(201);
    await api.post('/api/sections/projects?draft=1').send({ name: 'Idea 2', organization: 'Named Co', 'organizationThai:Named Co': 'เนมโค' }).expect(201);
    expect(await names(repos, ORGANIZATIONS)).toEqual(['Named Co']);

    await api.put(`/api/sections/projects/${(await repos.get('projects')!.list())[1].id}?draft=1`).send({ name: 'Idea 2', organization: 'Named Co' }).expect(200);
    expect((await repos.get(ORGANIZATIONS)!.list())[0].name_th).toBe('เนมโค');
  });

  it('rejects a Thai name that is not text', async () => {
    const res = await api.post('/api/sections/projects').send({ name: 'Film', organization: 'X', 'organizationThai:X': 5 }).expect(400);
    expect(res.body.fields).toEqual({ 'organizationThai:X': 'Send the Thai name as text' });
  });

  it('takes several organizations in one field, registering, renaming and naming each in Thai', async () => {
    const p = (
      await api
        .post('/api/sections/projects')
        .send({ name: 'Film', organization: ' Studio X ;Acme;; studio  x ', 'organizationThai:Acme': 'แอคมี', 'organizationThai:Nobody': 'ไม่มี' })
        .expect(201)
    ).body;
    // Tidied and each once.
    expect(p.organization).toBe('Studio X; Acme');
    expect(await names(repos, ORGANIZATIONS)).toEqual(['Acme', 'Studio X']);
    // A Thai name for an organization the entry doesn't name is ignored.
    expect((await repos.get(ORGANIZATIONS)!.list()).find((o) => o.name === 'Acme')!.name_th).toBe('แอคมี');

    const acme = (await repos.get(ORGANIZATIONS)!.list()).find((o) => o.name === 'Acme')!;
    await api.put(`/api/sections/organizations/${acme.id}`).send({ name: 'Acme Films' }).expect(200);
    expect((await repos.get('projects')!.get(p.id)).organization).toBe('Studio X; Acme Films');
  });

  it("refuses an organization name with a \";\", which separates organizations", async () => {
    const res = await api.post('/api/sections/organizations').send({ name: 'A; B' }).expect(400);
    expect(res.body.fields).toEqual({ name: 'An organization name can\'t contain ";"' });
  });

  it('rejects a duplicate organization name', async () => {
    await api.post('/api/sections/organizations').send({ name: 'Studio X' }).expect(201);
    const res = await api.post('/api/sections/organizations').send({ name: 'studio x' }).expect(400);
    expect(res.body.fields).toEqual({ name: '"Studio X" already exists' });
  });

  it('renaming an organization updates entries that use it', async () => {
    const project = (await api.post('/api/sections/projects').send({ name: 'Film', organization: 'Studio X' })).body;
    const [org] = await repos.get(ORGANIZATIONS)!.list();
    await api.put(`/api/sections/organizations/${org.id}`).send({ name: 'Studio Y' }).expect(200);
    expect((await repos.get('projects')!.get(project.id)).organization).toBe('Studio Y');
  });
});

describe('skills', () => {
  it('adds skills tagged on projects to the Skills page, but not hashtags', async () => {
    await api.post('/api/sections/projects').send({ name: 'App', skills: 'React, TypeScript' }).expect(201);
    await api.post('/api/sections/posts').send({ title: 'Post', hashtags: '#film' }).expect(201);
    expect(await names(repos, SKILLS)).toEqual(['React', 'TypeScript']);
  });

  it('rejects duplicate skills and renames them across entries', async () => {
    const project = (await api.post('/api/sections/projects').send({ name: 'App', skills: 'React' })).body;
    await api.post('/api/sections/skills').send({ name: 'react' }).expect(400);
    const [skill] = await repos.get(SKILLS)!.list();
    await api.put(`/api/sections/skills/${skill.id}`).send({ name: 'React.js' }).expect(200);
    expect((await repos.get('projects')!.get(project.id)).skills).toBe('React.js');
  });
});

describe('export', () => {
  it('dumps every section', async () => {
    await api.post('/api/sections/skills').send({ name: 'React' });
    const res = await api.get('/api/export').expect(200);
    expect(Object.keys(res.body.sections)).toContain('posts');
    expect(res.body.sections.skills).toHaveLength(1);
  });
});

describe('password login', () => {
  beforeEach(() => {
    vi.stubEnv('APP_PASSWORD', 'secret');
  });

  it('reports that login is required and blocks the API without a token', async () => {
    await api.get('/api/auth/status').expect(200, { required: true });
    await api.get('/api/sections/skills').expect(401, { error: 'Login required' });
    await api.get('/api/sections/skills').set('Authorization', 'Bearer 9999999999999.forged').expect(401);
    await api.get('/api/health').expect(200); // Render's health check stays public
  });

  it('rejects a wrong password and accepts the right one', async () => {
    await api.post('/api/auth/login').send({ password: 'wrong' }).expect(401, { error: 'Wrong password' });
    const { body } = await api.post('/api/auth/login').send({ password: 'secret' }).expect(200);
    await api.get('/api/sections/skills').set('Authorization', `Bearer ${body.token}`).expect(200);
  });

  it('invalidates tokens when the password changes', async () => {
    const { body } = await api.post('/api/auth/login').send({ password: 'secret' });
    vi.stubEnv('APP_PASSWORD', 'new-secret');
    await api.get('/api/sections/skills').set('Authorization', `Bearer ${body.token}`).expect(401);
  });

  it('refuses to run in production without a password', async () => {
    vi.stubEnv('APP_PASSWORD', '');
    vi.stubEnv('NODE_ENV', 'production');
    await api.get('/api/sections/skills').expect(503, { error: 'APP_PASSWORD is not set on the server' });
  });
});

describe('drafts', () => {
  it('saves a draft with required fields empty, but still checks what is filled in', async () => {
    const draft = await api.post('/api/sections/projects?draft=1').send({ name: '', url: 'not a url' }).expect(400);
    expect(draft.body.fields).toEqual({ url: 'Must be a valid URL, e.g. https://example.com' });

    const res = await api.post('/api/sections/projects?draft=1').send({ organization: 'Half Typed Studio' }).expect(201);
    expect(res.body).toMatchObject({ name: '', draft: 'true' });
    expect(await names(repos, ORGANIZATIONS)).toEqual([]); // not counted yet
  });

  it('publishes a draft when it is saved normally, which runs what the draft skipped', async () => {
    const { id } = (await api.post('/api/sections/projects?draft=1').send({ name: 'Film', organization: 'Studio X', skills: 'Editing' }).expect(201)).body;
    await api.put(`/api/sections/projects/${id}?draft=1`).send({ name: 'Film 2', organization: 'Studio X', skills: 'Editing' }).expect(200);
    expect(await names(repos, SKILLS)).toEqual([]);

    await api.put(`/api/sections/projects/${id}`).send({ name: '', organization: 'Studio X' }).expect(400); // full checks now
    const published = await api.put(`/api/sections/projects/${id}`).send({ name: 'Film 2', organization: 'Studio X', skills: 'Editing' }).expect(200);
    expect(published.body.draft).toBe('');
    expect(await names(repos, ORGANIZATIONS)).toEqual(['Studio X']);
    expect(await names(repos, SKILLS)).toEqual(['Editing']);
  });

  it('turns a saved entry back into a draft, unfinished again until it is saved', async () => {
    const { id } = (await api.post('/api/sections/projects').send({ name: 'Film' }).expect(201)).body;
    const res = await api.put(`/api/sections/projects/${id}?draft=1`).send({ name: '' }).expect(200);
    expect(res.body).toMatchObject({ name: '', draft: 'true' });
    const published = await api.put(`/api/sections/projects/${id}`).send({ name: 'Film' }).expect(200);
    expect(published.body.draft).toBe('');
  });

  it("doesn't allow drafts where they make no sense", async () => {
    await api.post('/api/sections/skills?draft=1').send({ name: 'React' }).expect(400);
    const saved = await api.post('/api/sections/skills').send({ name: 'React' }).expect(201);
    expect(saved.body).not.toHaveProperty('draft');
  });
});

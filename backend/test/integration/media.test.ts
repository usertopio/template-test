// Media uploads over HTTP: renaming, Drive folders, cascades. In-memory tabs and an in-memory Drive folder.
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigError, createApp } from '../../src/app';
import { MemoryFileStore, memoryRepos } from '@profile/core/testing';
import { MemoryResumable } from '../helpers/memoryResumable';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const PDF = Buffer.from('%PDF-1.7 test');

let repos: ReturnType<typeof memoryRepos>;
let files: MemoryFileStore;
let api: ReturnType<typeof request>;

beforeEach(() => {
  vi.stubEnv('APP_PASSWORD', '');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('MEDIA_OWNER_NAME', 'Tammasorn');
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

async function project(name = 'Parzival Film Profile', organization = '') {
  return (await api.post('/api/sections/projects').send({ name, organization }).expect(201)).body;
}

function upload(fields: Record<string, string>, file: Buffer | null = PNG, filename = 'photo.png') {
  const req = api.post('/api/media');
  for (const [k, v] of Object.entries(fields)) req.field(k, v);
  return file ? req.attach('file', file, filename) : req;
}

describe('About: profile photo and background', () => {
  it('keeps one of each: a new one replaces the old, and only images are accepted', async () => {
    const about = (await api.put('/api/single/about').send({ name: 'Tammasorn' }).expect(200)).body;
    const first = (await upload({ section: 'about', entryId: about.id, title: 'Profile photo', role: 'photo' }).expect(201)).body;
    await upload({ section: 'about', entryId: about.id, title: 'Background photo', role: 'banner' }).expect(201);
    const second = (await upload({ section: 'about', entryId: about.id, title: 'Profile photo', role: 'photo' }).expect(201)).body;

    const media = (await api.get('/api/media').expect(200)).body as { id: string; role: string }[];
    expect(media.map((m) => [m.role, m.id === second.id])).toEqual([
      ['banner', false],
      ['photo', true],
    ]);
    expect(media.some((m) => m.id === first.id)).toBe(false);
    expect(files.paths()).toEqual(['About/Tammasorn/About_Background-photo_Tammasorn.png', 'About/Tammasorn/About_Profile-photo_Tammasorn.png']);

    const pdf = await upload({ section: 'about', entryId: about.id, title: 'Profile photo', role: 'photo' }, PDF, 'me.pdf').expect(400);
    expect(pdf.body.fields).toEqual({ file: 'Use a JPG or PNG image' });
  });
});

describe('Organizations: logo', () => {
  it('keeps one logo: a new one replaces the old, only images are accepted, and it follows a rename', async () => {
    const org = (await api.post('/api/sections/organizations').send({ name: 'Fibo', type: 'Company' }).expect(201)).body;
    const first = (await upload({ section: 'organizations', entryId: org.id, title: 'Logo' }).expect(201)).body;
    expect(first).toMatchObject({ role: 'logo', fileName: 'Organization_Logo_Tammasorn.png' });
    const second = (await upload({ section: 'organizations', entryId: org.id, title: 'Logo' }).expect(201)).body;

    const media = (await api.get('/api/media').expect(200)).body as { id: string; role: string }[];
    expect(media.map((m) => [m.role, m.id])).toEqual([['logo', second.id]]);
    expect(files.paths()).toEqual(['Organizations/Fibo - Company/Organization_Logo_Tammasorn.png']);

    const pdf = await upload({ section: 'organizations', entryId: org.id, title: 'Logo' }, PDF, 'logo.pdf').expect(400);
    expect(pdf.body.fields).toEqual({ file: 'Use a JPG or PNG image' });

    await api.put(`/api/sections/organizations/${org.id}`).send({ name: 'Fibo Studio', type: 'Company' }).expect(200);
    expect(files.paths()).toEqual(['Organizations/Fibo Studio - Company/Organization_Logo_Tammasorn.png']);
  });
});

describe('uploading', () => {
  it('stores the file under <Section>/<Entry>/ with the <Section>_<Title>_<Owner> name', async () => {
    const p = await project();
    const res = await upload({ section: 'projects', entryId: p.id, title: 'AWS Certificate', description: 'Passed 2026' }).expect(201);
    expect(res.body).toMatchObject({
      section: 'projects',
      entryId: p.id,
      title: 'AWS Certificate',
      description: 'Passed 2026',
      fileName: 'Project_AWS-Certificate_Tammasorn.png',
      mimeType: 'image/png',
      size: String(PNG.length),
      position: '0',
    });
    expect(files.paths()).toEqual(['Projects/Parzival Film Profile/Project_AWS-Certificate_Tammasorn.png']);
    await api.get('/api/media').expect((r) => expect(r.body).toHaveLength(1));
  });

  it('names the folder after the title and first subtitle field', async () => {
    const job = (await api.post('/api/sections/experience').send({ title: 'Engineer', company: 'Depa' }).expect(201)).body;
    await upload({ section: 'experience', entryId: job.id, title: 'Offer letter' }, PDF, 'offer.pdf').expect(201);
    expect(files.paths()).toEqual(['Experience/Engineer - Depa/Experience_Offer-letter_Tammasorn.pdf']);
  });

  it('numbers files whose names clash within a folder', async () => {
    const p = await project();
    await upload({ section: 'projects', entryId: p.id, title: 'Certificate' }).expect(201);
    const second = await upload({ section: 'projects', entryId: p.id, title: 'certificate' }).expect(201);
    expect(second.body.fileName).toBe('Project_certificate_Tammasorn_2.png');
    expect(second.body.position).toBe('1');
  });

  it('detects the type from the content, not the file name', async () => {
    const p = await project();
    const res = await upload({ section: 'projects', entryId: p.id, title: 'Scan' }, PDF, 'scan.png').expect(201);
    expect(res.body.fileName).toBe('Project_Scan_Tammasorn.pdf');

    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00]);
    const bad = await upload({ section: 'projects', entryId: p.id, title: 'Doc' }, gif, 'x.png').expect(400);
    expect(bad.body.fields).toEqual({ file: 'Only JPG, PNG, PDF, MP4, MOV or WebM files, or TXT as a detail file' });
  });

  it('rejects a missing title or file, sections without media and unknown entries', async () => {
    const p = await project();
    expect((await upload({ section: 'projects', entryId: p.id, title: '' }).expect(400)).body.fields).toEqual({ title: 'Title is required' });
    expect((await upload({ section: 'projects', entryId: p.id, title: 'x' }, null).expect(400)).body.fields).toEqual({ file: 'Choose a file' });
    expect((await upload({ section: 'skills', entryId: p.id, title: 'x' }).expect(400)).body.fields).toEqual({ section: '"skills" doesn\'t accept media' });
    await upload({ section: 'projects', entryId: 'ghost', title: 'x' }).expect(404);
    expect(files.paths()).toEqual([]);
  });

  it('takes files up to 10 MB in one request; bigger ones go in pieces', async () => {
    const p = await project();
    const big = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]);
    const res = await upload({ section: 'projects', entryId: p.id, title: 'Huge' }, big).expect(413);
    expect(res.body.fields).toEqual({ file: 'Send files over 10 MB in pieces' });
  });

  it('explains when Drive is not configured', async () => {
    const noDrive = request(
      createApp(
        async () => repos,
        async () => {
          throw new ConfigError('DRIVE_FOLDER_URL is not set');
        },
      ),
    );
    await noDrive.get('/api/health').expect(200, { ok: true, media: { ok: false, error: 'DRIVE_FOLDER_URL is not set' } });
    const p = await project();
    const res = await noDrive.post('/api/media').field('section', 'projects').field('entryId', p.id).field('title', 'x').attach('file', PNG, 'a.png').expect(503);
    expect(res.body.error).toBe('DRIVE_FOLDER_URL is not set');
  });
});

describe('editing and deleting', () => {
  it('serves the file with its type', async () => {
    const p = await project();
    const item = (await upload({ section: 'projects', entryId: p.id, title: 'Poster' }).expect(201)).body;
    const res = await api.get(`/api/media/${item.id}/file`).buffer(true).expect(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['content-disposition']).toBe("inline; filename*=UTF-8''Project_Poster_Tammasorn.png");
    expect(Buffer.compare(res.body, PNG)).toBe(0);
  });

  it('renames the file when the title changes', async () => {
    const p = await project();
    const item = (await upload({ section: 'projects', entryId: p.id, title: 'Poster' }).expect(201)).body;
    const res = await api.put(`/api/media/${item.id}`).send({ title: 'Final Poster', description: 'v2' }).expect(200);
    expect(res.body).toMatchObject({ title: 'Final Poster', description: 'v2', fileName: 'Project_Final-Poster_Tammasorn.png' });
    expect(files.paths()).toEqual(['Projects/Parzival Film Profile/Project_Final-Poster_Tammasorn.png']);
  });

  it('keeps a Thai description beside the English one, both in Drive', async () => {
    const p = await project();
    const path = 'Projects/Parzival Film Profile/Project_Poster_Tammasorn.png';
    const item = (await upload({ section: 'projects', entryId: p.id, title: 'Poster', description: 'The poster', description_th: 'โปสเตอร์' }).expect(201)).body;
    expect(item).toMatchObject({ description: 'The poster', description_th: 'โปสเตอร์' });
    expect(files.descriptionOf(path)).toBe('The poster\n\nโปสเตอร์');

    // Changing only the Thai text still updates Drive.
    const res = await api.put(`/api/media/${item.id}`).send({ title: 'Poster', description: 'The poster', description_th: 'โปสเตอร์หนัง' }).expect(200);
    expect(res.body).toMatchObject({ description_th: 'โปสเตอร์หนัง' });
    expect(files.descriptionOf(path)).toBe('The poster\n\nโปสเตอร์หนัง');

    const long = await api.put(`/api/media/${item.id}`).send({ title: 'Poster', description_th: 'ก'.repeat(501) }).expect(400);
    expect(long.body.fields).toHaveProperty('description_th');
  });

  it('trashes the file, and the entry folder once it is empty', async () => {
    const p = await project();
    const a = (await upload({ section: 'projects', entryId: p.id, title: 'A' }).expect(201)).body;
    const b = (await upload({ section: 'projects', entryId: p.id, title: 'B' }).expect(201)).body;
    await api.delete(`/api/media/${a.id}`).expect(204);
    expect(files.paths()).toEqual(['Projects/Parzival Film Profile/Project_B_Tammasorn.png']);
    await api.delete(`/api/media/${b.id}`).expect(204);
    expect(files.paths()).toEqual([]);
    expect(files.folders()).toEqual(['Projects']);
    await api.get('/api/media').expect(200, []);
  });
});

describe('following the entry', () => {
  it('renames the entry folder when the entry is renamed', async () => {
    const p = await project('Old Name');
    await upload({ section: 'projects', entryId: p.id, title: 'Poster' }).expect(201);
    await api.put(`/api/sections/projects/${p.id}`).send({ name: 'New Name' }).expect(200);
    expect(files.paths()).toEqual(['Projects/New Name/Project_Poster_Tammasorn.png']);
  });

  it('moves files out of a folder shared with a same-named entry', async () => {
    const a = await project('Same');
    const b = await project('Same');
    await upload({ section: 'projects', entryId: a.id, title: 'Poster' }).expect(201);
    await upload({ section: 'projects', entryId: b.id, title: 'Poster' }).expect(201);
    expect(files.paths()).toEqual(['Projects/Same/Project_Poster_Tammasorn.png', 'Projects/Same/Project_Poster_Tammasorn_2.png']);

    await api.put(`/api/sections/projects/${b.id}`).send({ name: 'Different' }).expect(200);
    expect(files.paths()).toEqual(['Projects/Different/Project_Poster_Tammasorn_2.png', 'Projects/Same/Project_Poster_Tammasorn.png']);
  });

  it("deletes an entry's media with the entry", async () => {
    const keep = await project('Keep');
    const gone = await project('Gone');
    await upload({ section: 'projects', entryId: keep.id, title: 'A' }).expect(201);
    await upload({ section: 'projects', entryId: gone.id, title: 'B' }).expect(201);
    await api.delete(`/api/sections/projects/${gone.id}`).expect(204);
    expect(files.paths()).toEqual(['Projects/Keep/Project_A_Tammasorn.png']);
    expect((await api.get('/api/media')).body.map((m: { title: string }) => m.title)).toEqual(['A']);
  });

  it('includes media in the export', async () => {
    const p = await project();
    await upload({ section: 'projects', entryId: p.id, title: 'A' }).expect(201);
    expect((await api.get('/api/export')).body.media).toHaveLength(1);
  });
});

describe('certifications and certificates', () => {
  it('files each in its own folder with its own prefix', async () => {
    const a = (await api.post('/api/sections/certifications').send({ name: 'AWS Cloud Practitioner', issuer: 'Amazon' }).expect(201)).body;
    const b = (await api.post('/api/sections/certificates').send({ name: 'Data Analytics', issuer: 'Google' }).expect(201)).body;
    await upload({ section: 'certifications', entryId: a.id, title: 'Certificate' }, PDF, 'a.pdf').expect(201);
    await upload({ section: 'certificates', entryId: b.id, title: 'Course Completion' }).expect(201);
    expect(files.paths()).toEqual([
      'Certificates/Data Analytics - Google/Certificate_Course-Completion_Tammasorn.png',
      'Certifications/AWS Cloud Practitioner - Amazon/Certification_Certificate_Tammasorn.pdf',
    ]);
  });

  it('keeps the prefix when a certificate file is renamed', async () => {
    const c = (await api.post('/api/sections/certificates').send({ name: 'Data Analytics', issuer: 'Google' }).expect(201)).body;
    const item = (await upload({ section: 'certificates', entryId: c.id, title: 'Scan' }).expect(201)).body;
    const res = await api.put(`/api/media/${item.id}`).send({ title: 'Final' }).expect(200);
    expect(res.body.fileName).toBe('Certificate_Final_Tammasorn.png');
  });
});

describe('linked certificates in Drive', () => {
  const CERT = 'Certifications/AWS - Amazon/Certification_Certificate_Tammasorn.pdf';

  async function certWithFile(description = '') {
    const c = (await api.post('/api/sections/certifications').send({ name: 'AWS', issuer: 'Amazon' }).expect(201)).body;
    await upload({ section: 'certifications', entryId: c.id, title: 'Certificate', description }, PDF, 'c.pdf').expect(201);
    return c;
  }
  const linkProject = (name: string, certIds: string, organization = '') => api.post('/api/sections/projects').send({ name, organization, certificationIds: certIds }).expect(201);
  const mediaRow = async () => (await api.get('/api/media')).body.find((m: { section: string }) => m.section === 'certifications');

  it('writes the media description into Drive', async () => {
    await certWithFile('Passed with 900/1000');
    expect(files.descriptionOf(CERT)).toBe('Passed with 900/1000');
  });

  it('puts a shortcut in the linking project folder and lists the link in the description', async () => {
    const c = await certWithFile('Passed');
    await linkProject('Film', c.id);
    expect(files.paths()).toEqual([CERT, `Projects/Film/Certifications/Certification_Certificate_Tammasorn.pdf → ${CERT}`]);
    expect(files.descriptionOf(CERT)).toBe('Passed\n\nLinked to: Projects: Film');
    expect(await mediaRow()).toMatchObject({ linkedTo: 'Projects: Film' });
  });

  it('adds a shortcut per linking entry, and for files uploaded after linking', async () => {
    const c = (await api.post('/api/sections/certifications').send({ name: 'AWS', issuer: 'Amazon' }).expect(201)).body;
    await linkProject('Film', c.id);
    await api.post('/api/sections/volunteer').send({ organization: 'Red Cross', role: 'Camera', certificationIds: c.id }).expect(201);
    expect(files.paths()).toEqual([]); // nothing to link yet

    await upload({ section: 'certifications', entryId: c.id, title: 'Certificate' }, PDF, 'c.pdf').expect(201);
    expect(files.paths()).toEqual([
      CERT,
      `Projects/Film/Certifications/Certification_Certificate_Tammasorn.pdf → ${CERT}`,
      `Volunteer/Camera - Red Cross/Certifications/Certification_Certificate_Tammasorn.pdf → ${CERT}`,
    ]);
    expect(files.descriptionOf(CERT)).toBe('Linked to: Projects: Film · Volunteer: Camera - Red Cross');
  });

  it('removes the shortcut (and the emptied folder) when unlinked', async () => {
    const c = await certWithFile('Passed');
    const p = (await linkProject('Film', c.id)).body;
    await api.put(`/api/sections/projects/${p.id}`).send({ name: 'Film', certificationIds: '' }).expect(200);
    expect(files.paths()).toEqual([CERT]);
    expect(files.folders()).toEqual(['AWS - Amazon', 'Certifications', 'Projects']);
    expect(files.descriptionOf(CERT)).toBe('Passed');
    expect(await mediaRow()).toMatchObject({ linkedTo: '', shortcuts: '' });
  });

  it('keeps the shortcut with the project when it is renamed', async () => {
    const c = await certWithFile();
    const p = (await linkProject('Film', c.id)).body;
    await api.put(`/api/sections/projects/${p.id}`).send({ name: 'Short Film', certificationIds: c.id }).expect(200);
    expect(files.paths()).toEqual([CERT, `Projects/Short Film/Certifications/Certification_Certificate_Tammasorn.pdf → ${CERT}`]);
    expect(files.descriptionOf(CERT)).toBe('Linked to: Projects: Short Film');

    // A project with its own media: its folder is renamed and the shortcut stays inside.
    await upload({ section: 'projects', entryId: p.id, title: 'Poster' }).expect(201);
    await api.put(`/api/sections/projects/${p.id}`).send({ name: 'Final Film', certificationIds: c.id }).expect(200);
    expect(files.paths()).toEqual([
      CERT,
      `Projects/Final Film/Certifications/Certification_Certificate_Tammasorn.pdf → ${CERT}`,
      'Projects/Final Film/Project_Poster_Tammasorn.png',
    ]);
  });

  it('renames shortcuts along with the file', async () => {
    const c = await certWithFile();
    await linkProject('Film', c.id);
    const item = await mediaRow();
    await api.put(`/api/media/${item.id}`).send({ title: 'Badge' }).expect(200);
    expect(files.paths()).toEqual([
      'Certifications/AWS - Amazon/Certification_Badge_Tammasorn.pdf',
      'Projects/Film/Certifications/Certification_Badge_Tammasorn.pdf → Certifications/AWS - Amazon/Certification_Badge_Tammasorn.pdf',
    ]);
  });

  it('does the same for certificates', async () => {
    const c = (await api.post('/api/sections/certificates').send({ name: 'Data Analytics', issuer: 'Google' }).expect(201)).body;
    await upload({ section: 'certificates', entryId: c.id, title: 'Course Completion' }, PDF, 'c.pdf').expect(201);
    await api.post('/api/sections/volunteer').send({ organization: 'Red Cross', role: 'Camera', certificateIds: c.id }).expect(201);
    const target = 'Certificates/Data Analytics - Google/Certificate_Course-Completion_Tammasorn.pdf';
    expect(files.paths()).toEqual([target, `Volunteer/Camera - Red Cross/Certificates/Certificate_Course-Completion_Tammasorn.pdf → ${target}`]);
    expect(files.descriptionOf(target)).toBe('Linked to: Volunteer: Camera - Red Cross');
  });

  it('trashes the shortcuts when the certification or the project is deleted', async () => {
    const c = await certWithFile();
    const p = (await linkProject('Film', c.id)).body;
    await linkProject('Other', c.id);
    await api.delete(`/api/sections/projects/${p.id}`).expect(204);
    expect(files.paths()).toEqual([CERT, `Projects/Other/Certifications/Certification_Certificate_Tammasorn.pdf → ${CERT}`]);
    expect(files.descriptionOf(CERT)).toBe('Linked to: Projects: Other');

    await api.delete(`/api/sections/certifications/${c.id}`).expect(204);
    expect(files.paths()).toEqual([]);
    expect(files.folders()).toEqual(['Certifications', 'Projects']);
  });

  it('ignores links from posts, which have no Drive folder', async () => {
    const c = await certWithFile();
    await api.post('/api/sections/posts').send({ title: 'Passed AWS', certificationIds: c.id }).expect(201);
    expect(files.paths()).toEqual([CERT]);
    expect(files.descriptionOf(CERT)).toBe('');
  });

  it("doesn't link a project's own media into an activity that links the project", async () => {
    const p = await project('Film');
    await upload({ section: 'projects', entryId: p.id, title: 'Poster' }).expect(201);
    await api.post('/api/sections/activities').send({ name: 'Workshop', projectIds: p.id }).expect(201);
    expect(files.paths()).toEqual(['Projects/Film/Project_Poster_Tammasorn.png']);
    const [poster] = (await api.get('/api/media')).body;
    expect(poster.linkedTo ?? '').toBe('');
    expect(poster.shortcuts ?? '').toBe('');
  });
});

describe('background follow-ups', () => {
  it('answers first and finishes the Drive work afterwards', async () => {
    const bg = request(
      createApp(
        async () => repos,
        async () => files,
        { background: true },
      ),
    );
    const c = (await bg.post('/api/sections/certifications').send({ name: 'AWS', issuer: 'Amazon' }).expect(201)).body;
    await bg.post('/api/media').field('section', 'certifications').field('entryId', c.id).field('title', 'Certificate').attach('file', PDF, 'c.pdf').expect(201);
    await bg.post('/api/sections/projects').send({ name: 'Film', certificationIds: c.id }).expect(201);
    await vi.waitFor(() => expect(files.paths()).toHaveLength(2));
    expect(files.paths()[1]).toBe('Projects/Film/Certifications/Certification_Certificate_Tammasorn.pdf → Certifications/AWS - Amazon/Certification_Certificate_Tammasorn.pdf');
  });
});

describe('drafts and media', () => {
  it('lets a draft have media, and links it in Drive only once published', async () => {
    const c = (await api.post('/api/sections/certificates').send({ name: 'Data Analytics', issuer: 'Google' }).expect(201)).body;
    await upload({ section: 'certificates', entryId: c.id, title: 'Certificate' }, PDF, 'c.pdf').expect(201);
    const cert = 'Certificates/Data Analytics - Google/Certificate_Certificate_Tammasorn.pdf';

    const p = (await api.post('/api/sections/projects?draft=1').send({ name: 'Film', certificateIds: c.id }).expect(201)).body;
    await upload({ section: 'projects', entryId: p.id, title: 'Poster' }).expect(201);
    expect(files.paths()).toEqual([cert, 'Projects/Film/Project_Poster_Tammasorn.png']);

    await api.put(`/api/sections/projects/${p.id}`).send({ name: 'Film', certificateIds: c.id }).expect(200);
    expect(files.paths()).toEqual([cert, `Projects/Film/Certificates/Certificate_Certificate_Tammasorn.pdf → ${cert}`, 'Projects/Film/Project_Poster_Tammasorn.png']);

    // Back to a draft: its link stops counting, so the shortcut goes; its own files stay.
    await api.put(`/api/sections/projects/${p.id}?draft=1`).send({ name: 'Film', certificateIds: c.id }).expect(200);
    expect(files.paths()).toEqual([cert, 'Projects/Film/Project_Poster_Tammasorn.png']);
  });
});

describe('detail files', () => {
  it('go in a Details subfolder, are ordered on their own, follow a rename, and refuse videos', async () => {
    const p = await project('Film');
    await upload({ section: 'projects', entryId: p.id, title: 'Poster' }).expect(201);
    const a = (await upload({ section: 'projects', entryId: p.id, title: 'Agenda', role: 'detail' }, PDF, 'a.pdf').expect(201)).body;
    const b = (await upload({ section: 'projects', entryId: p.id, title: 'Brochure', role: 'detail' }, PDF, 'b.pdf').expect(201)).body;
    expect(a.role).toBe('detail');
    expect(files.paths()).toEqual(['Projects/Film/Details/Project_Agenda_Tammasorn.pdf', 'Projects/Film/Details/Project_Brochure_Tammasorn.pdf', 'Projects/Film/Project_Poster_Tammasorn.png']);

    // The detail files are a block of their own: ordering them leaves the media out.
    await api.put('/api/media/order').send({ entryId: p.id, ids: [b.id, a.id] }).expect(200);

    await api.put(`/api/sections/projects/${p.id}`).send({ name: 'Short film' }).expect(200);
    expect(files.paths()).toEqual(['Projects/Short film/Details/Project_Agenda_Tammasorn.pdf', 'Projects/Short film/Details/Project_Brochure_Tammasorn.pdf', 'Projects/Short film/Project_Poster_Tammasorn.png']);

    const mp4 = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
    await upload({ section: 'projects', entryId: p.id, title: 'Clip', role: 'detail' }, mp4, 'clip.mp4').expect(400);
  });

  it('can be text, read as UTF-8, but text goes nowhere else', async () => {
    const p = await project('Film');
    const text = Buffer.from('กำหนดการ\n09:00 Welcome');
    const notes = (await upload({ section: 'projects', entryId: p.id, title: 'Agenda', role: 'detail' }, text, 'agenda.txt').expect(201)).body;
    expect([notes.mimeType, notes.fileName]).toEqual(['text/plain', 'Project_Agenda_Tammasorn.txt']);
    expect(files.paths()).toEqual(['Projects/Film/Details/Project_Agenda_Tammasorn.txt']);
    const res = await api.get(`/api/media/${notes.id}/file`).expect(200);
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(res.text).toBe('กำหนดการ\n09:00 Welcome');

    // Its type comes from the content, so a renamed text file is still text.
    const media = await upload({ section: 'projects', entryId: p.id, title: 'Notes' }, text, 'notes.png').expect(400);
    expect(media.body.fields).toEqual({ file: 'Text files can only be detail files' });
    const c = (await api.post('/api/sections/certificates').send({ name: 'Course', issuer: 'X' }).expect(201)).body;
    await upload({ section: 'certificates', entryId: c.id, title: 'Certificate', role: 'credential' }, text, 'c.txt').expect(400);
  });

  it("aren't linked into other entries like a certificate file", async () => {
    const c = (await api.post('/api/sections/certificates').send({ name: 'Course', issuer: 'X' }).expect(201)).body;
    await upload({ section: 'certificates', entryId: c.id, title: 'Outline', role: 'detail' }, PDF, 'o.pdf').expect(201);
    await api.post('/api/sections/projects').send({ name: 'Film', certificateIds: c.id }).expect(201);
    expect(files.paths()).toEqual(['Certificates/Course - X/Details/Certificate_Outline_Tammasorn.pdf']);
  });
});

describe('ordering media', () => {
  it('saves a new order and rejects incomplete ones', async () => {
    const p = await project();
    const ids: string[] = [];
    for (const title of ['A', 'B', 'C']) ids.push((await upload({ section: 'projects', entryId: p.id, title }).expect(201)).body.id);

    const res = await api.put('/api/media/order').send({ entryId: p.id, ids: [ids[2], ids[0], ids[1]] }).expect(200);
    expect(res.body.map((m: { title: string }) => m.title)).toEqual(['C', 'A', 'B']);
    const listed = (await api.get('/api/media')).body.sort((a: { position: string }, b: { position: string }) => Number(a.position) - Number(b.position));
    expect(listed.map((m: { title: string }) => m.title)).toEqual(['C', 'A', 'B']);

    await api.put('/api/media/order').send({ entryId: p.id, ids: [ids[0], ids[1]] }).expect(400);
    await api.put('/api/media/order').send({ entryId: p.id, ids: [ids[0], ids[0], ids[1]] }).expect(400);
    await api.put('/api/media/order').send({ entryId: p.id }).expect(400);
  });
});

describe('videos', () => {
  const PIECE = 256 * 1024;
  // An MP4 of 2.5 pieces: "ftyp" box first, then filler.
  const video = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), Buffer.alloc(PIECE * 2.5 - 12, 7)]);
  let resumable: MemoryResumable;
  let vapi: ReturnType<typeof request>;

  beforeEach(() => {
    resumable = new MemoryResumable(files);
    vapi = request(createApp(async () => repos, async () => files, { getResumable: async () => resumable }));
  });

  const start = (entryId: string, fields: Record<string, unknown> = {}) =>
    vapi.post('/api/media/uploads').send({ section: 'projects', entryId, title: 'Trailer', description: 'Cut 1', description_th: 'ตัดต่อ 1', mimeType: 'video/mp4', size: video.length, ...fields });
  const piece = (id: string, from: number, to: number, data = video) =>
    vapi.put(`/api/media/uploads/${id}`).set('Content-Type', 'application/octet-stream').set('Content-Range', `bytes ${from}-${to - 1}/${video.length}`).send(data.subarray(from, to));

  it('uploads a video in pieces straight to Drive and records it', async () => {
    const p = await project();
    const { uploadId, chunkSize } = (await start(p.id).expect(201)).body;
    expect(chunkSize).toBe(8 * 1024 * 1024);
    expect((await piece(uploadId, 0, PIECE).expect(200)).body).toEqual({ done: false, received: PIECE });
    await piece(uploadId, PIECE, PIECE * 2).expect(200);
    const done = await piece(uploadId, PIECE * 2, video.length).expect(201);
    expect(done.body).toMatchObject({ done: true, item: { title: 'Trailer', description_th: 'ตัดต่อ 1', fileName: 'Project_Trailer_Tammasorn.mp4', mimeType: 'video/mp4', size: String(video.length) } });
    expect(files.paths()).toEqual(['Projects/Parzival Film Profile/Project_Trailer_Tammasorn.mp4']);
    expect(files.descriptionOf('Projects/Parzival Film Profile/Project_Trailer_Tammasorn.mp4')).toBe('Cut 1\n\nตัดต่อ 1');
  });

  it("uploads a post's own video, into a folder named after the post alone", async () => {
    const post = (await api.post('/api/sections/posts').send({ title: 'Launch day', status: 'draft' }).expect(201)).body;
    const { uploadId } = (await start(post.id, { section: 'posts', title: 'Teaser' }).expect(201)).body;
    await piece(uploadId, 0, PIECE).expect(200);
    await piece(uploadId, PIECE, PIECE * 2).expect(200);
    await piece(uploadId, PIECE * 2, video.length).expect(201);
    expect(files.paths()).toEqual(['Posts/Launch day/Post_Teaser_Tammasorn.mp4']);
    // Its status isn't part of the folder, so posting it moves nothing.
    await api.put(`/api/sections/posts/${post.id}`).send({ ...post, status: 'posted' }).expect(200);
    expect(files.paths()).toEqual(['Posts/Launch day/Post_Teaser_Tammasorn.mp4']);
  });

  it('checks the details, size and real type', async () => {
    const p = await project();
    expect((await start(p.id, { title: '' }).expect(400)).body.fields).toEqual({ title: 'Title is required' });
    expect((await start(p.id, { mimeType: 'text/plain' }).expect(400)).body.fields).toEqual({ file: 'Only JPG, PNG, PDF, MP4, MOV or WebM files upload in pieces' });
    expect((await start(p.id, { size: 501 * 1024 * 1024 }).expect(413)).body.fields).toEqual({ file: 'Videos can be at most 500 MB' });

    const { uploadId } = (await start(p.id).expect(201)).body;
    const fake = Buffer.alloc(video.length, 1); // claims to be MP4, isn't
    const res = await piece(uploadId, 0, PIECE, fake).expect(400);
    expect(res.body.fields).toEqual({ file: 'Only MP4, MOV or WebM videos' });
    expect(resumable.cancelled).toHaveLength(1);
    await piece(uploadId, 0, PIECE).expect(404);
    expect(files.paths()).toEqual([]);
  });

  it('takes a big image or PDF in pieces too, up to 100 MB, if it is what it was named', async () => {
    const p = await project();
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(PIECE * 2.5 - 4, 7)]);
    const send = (id: string, data: Buffer) =>
      vapi.put(`/api/media/uploads/${id}`).set('Content-Type', 'application/octet-stream').set('Content-Range', `bytes 0-${data.length - 1}/${data.length}`).send(data);
    const photo = (await start(p.id, { title: 'IMG_4717', mimeType: 'image/jpeg', size: jpeg.length, role: 'detail' }).expect(201)).body;
    const done = await send(photo.uploadId, jpeg).expect(201);
    expect(done.body.item).toMatchObject({ fileName: 'Project_IMG-4717_Tammasorn.jpg', mimeType: 'image/jpeg', role: 'detail' });

    expect((await start(p.id, { mimeType: 'application/pdf', size: 101 * 1024 * 1024 }).expect(413)).body.fields).toEqual({ file: 'Images and PDFs can be at most 100 MB' });
    // Named a PNG, but it's a JPG: its planned name would be wrong.
    const png = (await start(p.id, { title: 'Scan', mimeType: 'image/png', size: jpeg.length }).expect(201)).body;
    expect((await send(png.uploadId, jpeg).expect(400)).body.fields).toEqual({ file: "This isn't a PNG file" });
    // A profile photo stays small and goes in one request.
    const about = (await vapi.put('/api/single/about').send({ name: 'Me' }).expect(200)).body;
    await vapi.post('/api/media/uploads').send({ section: 'about', entryId: about.id, title: 'Profile photo', role: 'photo', mimeType: 'image/jpeg', size: jpeg.length }).expect(400);
  });

  it('insists on pieces in order and of the right size', async () => {
    const p = await project();
    const { uploadId } = (await start(p.id).expect(201)).body;
    expect((await piece(uploadId, PIECE, PIECE * 2).expect(409)).body.received).toBe(0);
    await piece(uploadId, 0, PIECE - 1).expect(400); // not a multiple of 256 KB
    await vapi.put(`/api/media/uploads/${uploadId}`).set('Content-Type', 'application/octet-stream').send(video.subarray(0, PIECE)).expect(400); // no range
    await vapi.delete(`/api/media/uploads/${uploadId}`).expect(204);
    expect(resumable.cancelled).toHaveLength(1);
  });

  it('streams with byte ranges through a signed link only', async () => {
    const p = await project();
    const { uploadId } = (await start(p.id).expect(201)).body;
    await piece(uploadId, 0, PIECE);
    await piece(uploadId, PIECE, PIECE * 2);
    const { item } = (await piece(uploadId, PIECE * 2, video.length)).body;

    const { url } = (await vapi.get(`/api/media/${item.id}/stream-url`).expect(200)).body;
    expect(url).toMatch(new RegExp(`^/api/media/${item.id}/stream\\?exp=\\d+&sig=`));
    const part = await vapi.get(url).set('Range', 'bytes=4-11').buffer(true).expect(206);
    expect(part.headers['content-range']).toBe(`bytes 4-11/${video.length}`);
    expect(part.headers['content-type']).toBe('video/mp4');
    expect(Buffer.from(part.body).toString()).toBe('ftypisom');
    const download = await vapi.get(`${url}&download=1`).buffer(true).expect(200);
    expect(download.headers['content-disposition']).toBe("attachment; filename*=UTF-8''Project_Trailer_Tammasorn.mp4");

    await vapi.get(url.replace(/sig=[^&]+/, 'sig=forged')).expect(403);
    await vapi.get(url.replace(/exp=\d+/, 'exp=1')).expect(403);
  });

  it('streams small files too, from memory when Drive streaming is unavailable', async () => {
    const p = await project();
    const item = (await upload({ section: 'projects', entryId: p.id, title: 'Poster' }).expect(201)).body;
    const { url } = (await api.get(`/api/media/${item.id}/stream-url`).expect(200)).body;
    const part = await api.get(url).set('Range', 'bytes=1-3').buffer(true).expect(206);
    expect([...Buffer.from(part.body)]).toEqual([0x50, 0x4e, 0x47]);
  });
});

describe('certificate file and other media', () => {
  const certificate = async () => (await api.post('/api/sections/certificates').send({ name: 'Data Analytics', issuer: 'Google' }).expect(201)).body;
  const ROOT = 'Certificates/Data Analytics - Google';

  it('keeps the certificate file apart from other media, which go in Media/', async () => {
    const c = await certificate();
    const scan = (await upload({ section: 'certificates', entryId: c.id, title: 'Scan' }, PDF, 's.pdf').expect(201)).body;
    const photo = (await upload({ section: 'certificates', entryId: c.id, title: 'Class Photo', role: 'media' }).expect(201)).body;
    expect(scan.role).toBe('credential');
    expect(photo.role).toBe('media');
    expect(files.paths()).toEqual([`${ROOT}/Certificate_Scan_Tammasorn.pdf`, `${ROOT}/Media/Certificate_Class-Photo_Tammasorn.png`]);
    expect(scan.position).toBe('0');
    expect(photo.position).toBe('0'); // ordered separately
  });

  it('links only the certificate file into projects, in a Certificates subfolder', async () => {
    const c = await certificate();
    await upload({ section: 'certificates', entryId: c.id, title: 'Scan' }, PDF, 's.pdf').expect(201);
    await upload({ section: 'certificates', entryId: c.id, title: 'Class Photo', role: 'media' }).expect(201);
    await api.post('/api/sections/projects').send({ name: 'Film', certificateIds: c.id }).expect(201);
    expect(files.paths()).toEqual([
      `${ROOT}/Certificate_Scan_Tammasorn.pdf`,
      `${ROOT}/Media/Certificate_Class-Photo_Tammasorn.png`,
      `Projects/Film/Certificates/Certificate_Scan_Tammasorn.pdf → ${ROOT}/Certificate_Scan_Tammasorn.pdf`,
    ]);
    expect(files.descriptionOf(`${ROOT}/Media/Certificate_Class-Photo_Tammasorn.png`)).toBe('');
  });

  it('only takes images and PDFs as the certificate file', async () => {
    const c = await certificate();
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), Buffer.alloc(8)]);
    const res = await upload({ section: 'certificates', entryId: c.id, title: 'Clip' }, mp4, 'c.mp4').expect(400);
    expect(res.body.fields).toEqual({ file: 'The certificate file must be a JPG, PNG or PDF' });
    await upload({ section: 'certificates', entryId: c.id, title: 'Clip', role: 'media' }, mp4, 'c.mp4').expect(201);
  });

  it('renames the entry folder with its Media subfolder inside', async () => {
    const c = await certificate();
    await upload({ section: 'certificates', entryId: c.id, title: 'Scan' }, PDF, 's.pdf').expect(201);
    await upload({ section: 'certificates', entryId: c.id, title: 'Photo', role: 'media' }).expect(201);
    await api.put(`/api/sections/certificates/${c.id}`).send({ name: 'Data Analytics Pro', issuer: 'Google' }).expect(200);
    expect(files.paths()).toEqual([
      'Certificates/Data Analytics Pro - Google/Certificate_Scan_Tammasorn.pdf',
      'Certificates/Data Analytics Pro - Google/Media/Certificate_Photo_Tammasorn.png',
    ]);
  });

  it('renames the folder even when the entry only has other media', async () => {
    const c = await certificate();
    await upload({ section: 'certificates', entryId: c.id, title: 'Photo', role: 'media' }).expect(201);
    await api.put(`/api/sections/certificates/${c.id}`).send({ name: 'Renamed', issuer: 'Google' }).expect(200);
    expect(files.paths()).toEqual(['Certificates/Renamed - Google/Media/Certificate_Photo_Tammasorn.png']);
  });

  it('orders the certificate files and the other media separately', async () => {
    const c = await certificate();
    const a = (await upload({ section: 'certificates', entryId: c.id, title: 'Front' }).expect(201)).body;
    const b = (await upload({ section: 'certificates', entryId: c.id, title: 'Back' }).expect(201)).body;
    const m = (await upload({ section: 'certificates', entryId: c.id, title: 'Photo', role: 'media' }).expect(201)).body;
    const res = await api.put('/api/media/order').send({ entryId: c.id, ids: [b.id, a.id] }).expect(200);
    expect(res.body.map((x: { title: string }) => x.title)).toEqual(['Back', 'Front']);
    await api.put('/api/media/order').send({ entryId: c.id, ids: [b.id, a.id, m.id] }).expect(400); // mixes the two groups
  });

  it('moves shortcuts made before subfolders existed when everything is re-synced', async () => {
    const c = await certificate();
    await upload({ section: 'certificates', entryId: c.id, title: 'Scan' }, PDF, 's.pdf').expect(201);
    await api.post('/api/sections/projects').send({ name: 'Film', certificateIds: c.id }).expect(201);
    // Make it look like the old layout: shortcut straight in the project folder.
    const row = (await repos.get('media')!.list()).find((r) => r.section === 'certificates')!;
    const [shortcut] = JSON.parse(row.shortcuts);
    const projectFolder = await files.folder(['Projects', 'Film']);
    await files.update(shortcut.id, { folderId: projectFolder });
    await repos.get('media')!.update(row.id, { shortcuts: JSON.stringify([{ ...shortcut, folderId: projectFolder, path: 'Projects/Film', parentId: undefined }]) });
    expect(files.paths()).toContain(`Projects/Film/Certificate_Scan_Tammasorn.pdf → ${ROOT}/Certificate_Scan_Tammasorn.pdf`);

    const { syncAllMediaLinks } = await import('@profile/core');
    await syncAllMediaLinks(repos, async () => files);
    expect(files.paths()).toEqual([`${ROOT}/Certificate_Scan_Tammasorn.pdf`, `Projects/Film/Certificates/Certificate_Scan_Tammasorn.pdf → ${ROOT}/Certificate_Scan_Tammasorn.pdf`]);
  });
});

describe('thumbnails', () => {
  it("serves Drive's small preview, or 404 until Drive has one", async () => {
    const resumable = new MemoryResumable(files);
    const tapi = request(createApp(async () => repos, async () => files, { getResumable: async () => resumable }));
    const p = await project();
    const item = (await upload({ section: 'projects', entryId: p.id, title: 'Poster' }).expect(201)).body;

    await tapi.get(`/api/media/${item.id}/thumb`).expect(404, { error: 'No thumbnail yet' });
    resumable.thumbnails.add(item.fileId);
    const res = await tapi.get(`/api/media/${item.id}/thumb?size=5000`).buffer(true).expect(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toBe('private, max-age=86400');
    expect(Buffer.from(res.body).toString()).toBe(`thumb ${item.fileId} 800`); // size capped
    await api.get(`/api/media/${item.id}/thumb`).expect(404); // no direct Drive access: fall back
  });
});

describe("a post's picked media", () => {
  it('keeps the files picked from other entries, in order, without touching them', async () => {
    const p = await project();
    const a = (await upload({ section: 'projects', entryId: p.id, title: 'Poster' }).expect(201)).body;
    const b = (await upload({ section: 'projects', entryId: p.id, title: 'Still' }).expect(201)).body;
    const post = (await api.post('/api/sections/posts').send({ title: 'Launch', mediaIds: `${b.id}, ${a.id}` }).expect(201)).body;
    expect(post.mediaIds).toBe(`${b.id},${a.id}`);
    // Still the project's files, in its folder.
    expect(files.paths()).toEqual(['Projects/Parzival Film Profile/Project_Poster_Tammasorn.png', 'Projects/Parzival Film Profile/Project_Still_Tammasorn.png']);
  });

  it('drops ids of files that no longer exist when saved', async () => {
    const p = await project();
    const a = (await upload({ section: 'projects', entryId: p.id, title: 'Poster' }).expect(201)).body;
    const post = (await api.post('/api/sections/posts').send({ title: 'Launch', mediaIds: `gone,${a.id}` }).expect(201)).body;
    expect(post.mediaIds).toBe(a.id);
  });

  it('lets go of a file deleted from its entry, or deleted with its entry', async () => {
    const p = await project();
    const other = await project('Other');
    const a = (await upload({ section: 'projects', entryId: p.id, title: 'Poster' }).expect(201)).body;
    const b = (await upload({ section: 'projects', entryId: other.id, title: 'Still' }).expect(201)).body;
    const c = (await upload({ section: 'projects', entryId: other.id, title: 'Clip' }).expect(201)).body;
    const post = (await api.post('/api/sections/posts').send({ title: 'Launch', mediaIds: `${a.id},${b.id},${c.id}` }).expect(201)).body;

    await api.delete(`/api/media/${a.id}`).expect(204);
    expect((await api.get(`/api/sections/posts/${post.id}`).expect(200)).body.mediaIds).toBe(`${b.id},${c.id}`);
    await api.delete(`/api/sections/projects/${other.id}`).expect(204);
    expect((await api.get(`/api/sections/posts/${post.id}`).expect(200)).body.mediaIds).toBe('');
  });
});

describe("a post's own media", () => {
  it('takes photos and PDFs too, all plain media: no detail files', async () => {
    const post = (await api.post('/api/sections/posts').send({ title: 'Launch day' }).expect(201)).body;
    await upload({ section: 'posts', entryId: post.id, title: 'Cover' }).expect(201);
    const asDetail = (await upload({ section: 'posts', entryId: post.id, title: 'Agenda', role: 'detail' }, PDF, 'agenda.pdf').expect(201)).body;
    expect(asDetail.role).toBe('');
    expect(files.paths()).toEqual(['Posts/Launch day/Post_Agenda_Tammasorn.pdf', 'Posts/Launch day/Post_Cover_Tammasorn.png']);
  });
});

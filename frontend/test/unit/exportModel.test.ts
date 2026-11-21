import { describe, expect, it } from 'vitest';
import { getSection, type Entry, type MediaItem } from '@profile/shared';
import { buildExport, exportFiles, relatedSections } from '../../src/export/model';
import { imageSize } from '../../src/export/images';
import { wrapThai } from '../../src/export/pdf';

const projects = getSection('projects')!;
const certificates = getSection('certificates')!;
const entry = (data: Record<string, string>): Entry => ({ id: 'p1', createdAt: '', updatedAt: '', ...data });
const file = (id: string, title: string, role = ''): MediaItem =>
  ({ id, entryId: 'p1', section: 'projects', title, description: `About ${title}`, mimeType: 'image/png', fileName: `Project_${title}_Me.png`, position: '0', role, createdAt: '' }) as MediaItem;

const film = entry({
  name: 'Film',
  name_th: 'ภาพยนตร์',
  organization: 'Studio X',
  startDate: '2024-03',
  description: 'A short film',
  skills: 'Editing',
  certificateIds: 'c1',
});
const data = {
  related: new Map([['certificates', [{ id: 'c1', name: 'Editing course', name_th: 'คอร์สตัดต่อ', createdAt: '', updatedAt: '' }]]]),
  media: [file('m1', 'Poster'), file('m2', 'Still')],
  names: { organizations: [{ name: 'Studio X', name_th: 'สตูดิโอเอ็กซ์' }], skills: [] },
};

describe('export model', () => {
  it('has every filled-in field, linked entries by name, in the chosen language', () => {
    const [part] = buildExport('Projects', [{ section: projects, entries: [film] }], 'th', data).sections;
    const [e] = part.entries;
    expect(e.titles).toEqual(['ภาพยนตร์']);
    expect(Object.fromEntries(e.fields.map((f) => [f.label, f.text]))).toEqual({
      Organization: 'สตูดิโอเอ็กซ์',
      'Start date': '03/24',
      Description: 'A short film',
      Skills: 'Editing',
      'Linked certificates': 'คอร์สตัดต่อ',
    });
  });

  it('gives both languages where they differ, once where they are the same', () => {
    const [e] = buildExport('Projects', [{ section: projects, entries: [film] }], 'both', data).sections[0].entries;
    expect(e.titles).toEqual(['Film', 'ภาพยนตร์']);
    expect(e.fields.map((f) => f.label)).toEqual(['Organization', 'Organization (ไทย)', 'Start date', 'Description', 'Skills', 'Linked certificates', 'Linked certificates (ไทย)']);
  });

  it('keeps only the chosen files, with their paths in the zip when files are included', () => {
    const parts = [{ section: projects, entries: [film], mediaIds: ['m2'] }];
    const [e] = buildExport('Projects', parts, 'en', data, { includeFiles: true }).sections[0].entries;
    expect(e.files.map((f) => [f.item.title, f.path])).toEqual([['Still', 'media/Film - Studio X/Project_Still_Me.png']]);
    expect(exportFiles(parts, data.media).map((f) => f.path)).toEqual(['media/Film - Studio X/Project_Still_Me.png']);
    expect(buildExport('Projects', parts, 'en', data).sections[0].entries[0].files[0].path).toBeUndefined();
  });

  it("gives a file's description in each language, the English where there's no Thai", () => {
    const media = [{ ...file('m1', 'Poster'), description_th: 'เกี่ยวกับโปสเตอร์' }, file('m2', 'Still')];
    const descriptions = (lang: 'en' | 'th' | 'both') =>
      buildExport('Projects', [{ section: projects, entries: [film] }], lang, { ...data, media }).sections[0].entries[0].files.map((f) => f.descriptions);
    expect(descriptions('en')).toEqual([['About Poster'], ['About Still']]);
    expect(descriptions('th')).toEqual([['เกี่ยวกับโปสเตอร์'], ['About Still']]);
    expect(descriptions('both')).toEqual([['About Poster', 'เกี่ยวกับโปสเตอร์'], ['About Still']]);
  });

  it('puts a certificate file before its other media', () => {
    const cert = entry({ name: 'AWS', issuer: 'Amazon' });
    const media = [file('m1', 'Photo', 'media'), file('m2', 'Scan', 'credential')];
    const [e] = buildExport('Certificates', [{ section: certificates, entries: [cert] }], 'en', { ...data, media }).sections[0].entries;
    expect(e.files.map((f) => [f.group, f.item.title])).toEqual([
      ['Certificate file', 'Scan'],
      ['Media', 'Photo'],
    ]);
  });

  it('reads the sections linked from the exported ones', () => {
    expect(relatedSections([{ section: projects, entries: [] }])).toEqual(['certifications', 'certificates']);
  });
});

describe('export helpers', () => {
  it('reads PNG and JPEG sizes from their headers', () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47]);
    new DataView(png.buffer).setUint32(16, 640);
    new DataView(png.buffer).setUint32(20, 480);
    expect(imageSize(png)).toEqual({ width: 640, height: 480 });
    // SOI, an APP0 segment, then SOF0 with height 300, width 400.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x01, 0x2c, 0x01, 0x90, 3, 0, 0, 0, 0, 0, 0]);
    expect(imageSize(jpeg)).toEqual({ width: 400, height: 300 });
    expect(imageSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('marks where Thai lines may break, between words', () => {
    expect(wrapThai('สวัสดีครับ')).toBe('สวัสดี​ครับ');
    expect(wrapThai('Hello there')).toBe('Hello there');
  });
});

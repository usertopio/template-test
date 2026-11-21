import { describe, expect, it } from 'vitest';
import { driveDescription, entryFolderName, getSection, mediaDescription, mediaFileName, mediaNaming, mediaSchema, uniqueFileName } from '../../src';

describe('mediaFileName', () => {
  it('joins section, title and owner with underscores', () => {
    expect(mediaFileName('Project', 'Certificate', 'Tammasorn', 'png')).toBe('Project_Certificate_Tammasorn.png');
  });

  it('turns spaces into dashes and strips characters that are unsafe or would add separators', () => {
    expect(mediaFileName('Project', '  AWS  Cloud: Practitioner / 2026?  ', 'Tammasorn', 'jpg')).toBe('Project_AWS-Cloud-Practitioner-2026_Tammasorn.jpg');
    expect(mediaFileName('Project', 'snake_case_title', 'Tammasorn', 'png')).toBe('Project_snake-case-title_Tammasorn.png');
  });

  it('keeps non-Latin text', () => {
    expect(mediaFileName('Education', 'ใบประกาศ นียบัตร', 'Tammasorn', 'pdf')).toBe('Education_ใบประกาศ-นียบัตร_Tammasorn.pdf');
  });

  it('falls back to "Media" for an empty title and drops an empty owner', () => {
    expect(mediaFileName('Project', '', '', 'png')).toBe('Project_Media.png');
    expect(mediaFileName('Project', '???', 'Tammasorn', 'png')).toBe('Project_Tammasorn.png');
  });
});

describe('uniqueFileName', () => {
  it('adds _2, _3… before the extension, ignoring case', () => {
    expect(uniqueFileName('a.png', [])).toBe('a.png');
    expect(uniqueFileName('a.png', ['A.png'])).toBe('a_2.png');
    expect(uniqueFileName('a.png', ['a.png', 'a_2.png'])).toBe('a_3.png');
  });
});

describe('entryFolderName', () => {
  it('uses the title and the first subtitle field', () => {
    expect(entryFolderName(getSection('experience')!, { title: 'Engineer', company: 'Depa' })).toBe('Engineer - Depa');
    expect(entryFolderName(getSection('projects')!, { name: 'Film', organization: '' })).toBe('Film');
    expect(entryFolderName(getSection('projects')!, {})).toBe('(untitled)');
  });
});

describe('mediaSchema', () => {
  it('requires a title and enforces the limits', () => {
    expect(mediaSchema.safeParse({ title: ' Cert ' }).data).toEqual({ title: 'Cert', description: '', description_th: '' });
    expect(mediaSchema.safeParse({ title: '' }).success).toBe(false);
    expect(mediaSchema.safeParse({ title: 'x'.repeat(101) }).success).toBe(false);
    expect(mediaSchema.safeParse({ title: 'x', description: 'x'.repeat(501) }).success).toBe(false);
    expect(mediaSchema.safeParse({ title: 'x', description_th: 'ก'.repeat(501) }).success).toBe(false);
  });
});

describe('media descriptions', () => {
  it('shows the Thai description in Thai, the English one where there is none', () => {
    expect(mediaDescription({ description: 'Poster', description_th: 'โปสเตอร์' }, 'th')).toBe('โปสเตอร์');
    expect(mediaDescription({ description: 'Poster', description_th: ' ' }, 'th')).toBe('Poster');
    expect(mediaDescription({ description: 'Poster', description_th: 'โปสเตอร์' }, 'en')).toBe('Poster');
  });

  it('puts both in Drive, then the links', () => {
    expect(driveDescription({ description: 'Poster', description_th: 'โปสเตอร์' }, 'Projects: Film')).toBe('Poster\n\nโปสเตอร์\n\nLinked to: Projects: Film');
    expect(driveDescription({ description: '', description_th: '' }, '')).toBe('');
  });
});

describe('mediaNaming', () => {
  it('uses the section prefix and tab by default', () => {
    expect(mediaNaming(getSection('projects')!, {})).toEqual({ prefix: 'Project', folder: 'Projects' });
  });

  it('gives certifications and certificates their own prefix and folder', () => {
    expect(mediaNaming(getSection('certifications')!)).toEqual({ prefix: 'Certification', folder: 'Certifications' });
    expect(mediaNaming(getSection('certificates')!)).toEqual({ prefix: 'Certificate', folder: 'Certificates' });
  });
});

describe('media kinds and limits', () => {
  it('sorts types into images, videos, PDFs and text with their own limits', async () => {
    const { mediaKind, maxBytesFor, mimeFromName, uploadsInPieces } = await import('../../src');
    expect(['image/png', 'video/quicktime', 'application/pdf', 'text/plain'].map(mediaKind)).toEqual(['image', 'video', 'pdf', 'text']);
    expect(maxBytesFor('image/jpeg')).toBe(100 * 1024 * 1024);
    expect(maxBytesFor('application/pdf')).toBe(100 * 1024 * 1024);
    // Over 10 MB, or any video, goes to Drive in pieces.
    expect([uploadsInPieces('image/jpeg', 10 * 1024 * 1024), uploadsInPieces('image/jpeg', 10 * 1024 * 1024 + 1), uploadsInPieces('video/mp4', 1)]).toEqual([false, true, true]);
    expect(maxBytesFor('text/plain')).toBe(10 * 1024 * 1024);
    expect(maxBytesFor('video/mp4')).toBe(500 * 1024 * 1024);
    expect(mimeFromName('Clip.MOV')).toBe('video/quicktime');
    expect(mimeFromName('notes.txt')).toBe('text/plain');
    expect(mimeFromName('notes.md')).toBeUndefined();
  });

  it('names a format as shown on a file', async () => {
    const { formatLabel } = await import('../../src');
    expect(formatLabel('image/jpeg')).toBe('JPG');
    expect(formatLabel('text/plain', 'Agenda.txt')).toBe('TXT');
    expect(formatLabel('image/gif', 'old.gif')).toBe('GIF');
    expect(formatLabel('', 'README')).toBe('File');
  });
});

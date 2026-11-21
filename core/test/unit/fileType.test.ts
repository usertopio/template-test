import { describe, expect, it } from 'vitest';
import { detectMediaType } from '../../src/fileType';

describe('detectMediaType', () => {
  it('recognizes JPG, PNG and PDF by their first bytes', () => {
    expect(detectMediaType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectMediaType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(detectMediaType(Buffer.from('%PDF-1.4'))).toBe('application/pdf');
  });

  it('rejects anything else, including empty and truncated files', () => {
    expect(detectMediaType(Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00]))).toBeUndefined(); // GIF
    expect(detectMediaType(Buffer.alloc(0))).toBeUndefined();
    expect(detectMediaType(Buffer.from([0x89, 0x50]))).toBeUndefined();
  });
});

describe('detectMediaType for text', () => {
  it('takes UTF-8 text as plain text, Thai and a BOM included', () => {
    expect(detectMediaType(Buffer.from('Agenda\r\n\t09:00 Welcome\n'))).toBe('text/plain');
    expect(detectMediaType(Buffer.from('กำหนดการ สัมมนา 😀'))).toBe('text/plain');
    expect(detectMediaType(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Notes')]))).toBe('text/plain');
    // Markup is still only text: it's stored and served as text/plain, never as an image or a page.
    expect(detectMediaType(Buffer.from('<svg/>'))).toBe('text/plain');
  });

  it('refuses control characters, invalid UTF-8 and a character cut short', () => {
    expect(detectMediaType(Buffer.from([0x61, 0x00, 0x62]))).toBeUndefined();
    expect(detectMediaType(Buffer.from([0x61, 0x1b, 0x62]))).toBeUndefined();
    expect(detectMediaType(Buffer.from([0x61, 0xff, 0x62]))).toBeUndefined();
    expect(detectMediaType(Buffer.from([0x61, 0xc0, 0xaf]))).toBeUndefined(); // overlong
    expect(detectMediaType(Buffer.from([0x61, 0xe0, 0xb8]))).toBeUndefined(); // Thai cut short
    expect(detectMediaType(Buffer.from([0x61, 0xe0, 0x41, 0x41]))).toBeUndefined();
  });
});

describe('detectMediaType for video', () => {
  const ftyp = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from(`ftyp${brand}`), Buffer.alloc(8)]);

  it('recognizes MP4, QuickTime and WebM', () => {
    expect(detectMediaType(ftyp('isom'))).toBe('video/mp4');
    expect(detectMediaType(ftyp('mp42'))).toBe('video/mp4');
    expect(detectMediaType(ftyp('qt  '))).toBe('video/quicktime');
    expect(detectMediaType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]))).toBe('video/webm');
  });

  it('rejects other containers', () => {
    expect(detectMediaType(Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x10, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20]))).toBeUndefined(); // RIFF AVI
    expect(detectMediaType(Buffer.from([0, 0, 0, 0x20]))).toBeUndefined();
  });
});

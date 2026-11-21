import { unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { getSection, type Entry, type MediaItem } from '@profile/shared';
import { zipBlob, zipPaths } from '../../src/download';

const certs = getSection('certificates')!;
const entry = (id: string, name: string, issuer = 'Google') => ({ id, name, issuer, createdAt: '', updatedAt: '' }) as Entry;
const item = (id: string, entryId: string, fileName: string, position = '0') => ({ id, entryId, fileName, title: fileName, position, createdAt: '' }) as MediaItem;

describe('zipPaths', () => {
  const entries = [entry('a', 'Data Analytics'), entry('b', 'Data Analytics'), entry('c', 'No files')];
  const media = [item('1', 'a', 'Certificate_X_T.pdf', '1'), item('2', 'a', 'Certificate_Badge_T.png', '0'), item('3', 'b', 'Certificate_X_T.pdf')];

  it('puts each entry in a folder like Drive, keeping same-named folders apart', () => {
    expect(zipPaths(certs, entries, media, { folders: true }).map((f) => f.path)).toEqual([
      'Data Analytics - Google/Certificate_Badge_T.png',
      'Data Analytics - Google/Certificate_X_T.pdf',
      'Data Analytics - Google_2/Certificate_X_T.pdf',
    ]);
  });

  it('puts one entry’s files at the top', () => {
    expect(zipPaths(certs, [entries[0]], media, { folders: false }).map((f) => f.path)).toEqual(['Certificate_Badge_T.png', 'Certificate_X_T.pdf']);
  });
});

describe('zipBlob', () => {
  it('zips the fetched files under their paths', async () => {
    vi.stubGlobal('fetch', async (url: string) => new Response(new TextEncoder().encode(`content of ${url}`)));
    const blob = await zipBlob([
      { path: 'A/one.pdf', url: 'blob:1' },
      { path: 'two.png', url: 'blob:2' },
    ]);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(files)).toEqual(['A/one.pdf', 'two.png']);
    expect(new TextDecoder().decode(files['two.png'])).toBe('content of blob:2');
  });
});

describe('zipPaths for a certificate with other media', () => {
  it('puts the other media in Media/, like Drive', () => {
    const media = [item('1', 'a', 'Certificate_Scan_T.pdf'), { ...item('2', 'a', 'Certificate_Photo_T.png'), role: 'media' } as MediaItem];
    expect(zipPaths(certs, [entry('a', 'Data Analytics')], media, { folders: true }).map((f) => f.path)).toEqual([
      'Data Analytics - Google/Certificate_Scan_T.pdf',
      'Data Analytics - Google/Media/Certificate_Photo_T.png',
    ]);
  });
});

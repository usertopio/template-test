import { describe, expect, it, vi } from 'vitest';
import { DriveRest } from '../../src/media/resumable';

describe('DriveRest', () => {
  it('opens a session, sends pieces and reads "keep going" (308) and "done" answers', async () => {
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(null, { status: 200, headers: { location: 'https://upload.test/session-1' } });
      const range = (init?.headers as Record<string, string>)['Content-Range'];
      return range.endsWith('-9/10') ? Response.json({ id: 'file-1' }) : new Response(null, { status: 308 });
    });
    const drive = new DriveRest(async () => 'token-1', fetch as typeof globalThis.fetch);
    const session = await drive.startSession({ name: 'a.mp4', folderId: 'f', mimeType: 'video/mp4', size: 10, description: 'd' });
    expect(session).toBe('https://upload.test/session-1');
    const [, start] = fetch.mock.calls[0];
    expect(start!.headers).toMatchObject({ Authorization: 'Bearer token-1', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': '10' });
    expect(JSON.parse(start!.body as string)).toEqual({ name: 'a.mp4', parents: ['f'], mimeType: 'video/mp4', description: 'd' });

    expect(await drive.putChunk(session, new Uint8Array(6), 0, 10)).toEqual({ done: false });
    expect(await drive.putChunk(session, new Uint8Array(4), 6, 10)).toEqual({ done: true, fileId: 'file-1' });
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'PUT', redirect: 'manual', headers: { 'Content-Range': 'bytes 0-5/10' } });
  });

  it('renews an expired token and tries once more, and passes other Drive errors on readably', async () => {
    const getToken = vi.fn(async () => `token-${getToken.mock.calls.length}`);
    let calls = 0;
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const auth = (init?.headers as Record<string, string>).Authorization;
      if (calls === 1) return Response.json({ error: { message: 'Invalid Credentials' } }, { status: 401 });
      if (calls === 3) return Response.json({ error: { message: 'Rate limit' } }, { status: 403 });
      return new Response(`bytes via ${auth}`, { status: 206, headers: { 'content-range': 'bytes 0-2/9' } });
    });
    const drive = new DriveRest(getToken, fetch as typeof globalThis.fetch);
    const out = await drive.stream('f1', 'bytes=0-2');
    expect(out.status).toBe(206);
    expect(await new Response(out.body).text()).toBe('bytes via Bearer token-2'); // the renewed one
    expect(getToken).toHaveBeenCalledTimes(2);
    await expect(drive.stream('f1')).rejects.toMatchObject({ status: 502, message: 'Drive download failed: Rate limit' });
  });

  it('shares one token renewal between requests made at the same moment', async () => {
    const getToken = vi.fn(async () => 'token');
    const fetch = vi.fn(async () => new Response('x'));
    const drive = new DriveRest(getToken, fetch as typeof globalThis.fetch);
    await Promise.all([drive.stream('a'), drive.stream('b'), drive.stream('c')]);
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it('fetches the thumbnail at the size asked for, or null when Drive has none', async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('fields=thumbnailLink')) return Response.json(u.includes('f-none') ? {} : { thumbnailLink: 'https://lh3.test/abc=s220' });
      return new Response('jpeg', { headers: { 'content-type': 'image/jpeg' } });
    });
    const drive = new DriveRest(async () => 't', fetch as typeof globalThis.fetch);
    const thumb = await drive.thumbnail('f1', 200);
    expect(new TextDecoder().decode(thumb!.data)).toBe('jpeg');
    expect(fetch.mock.calls[1][0]).toBe('https://lh3.test/abc=s200');
    expect(await drive.thumbnail('f-none', 200)).toBeNull();
  });
});

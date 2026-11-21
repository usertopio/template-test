import { describe, expect, it, vi } from 'vitest';
import { AppsScriptStore, createScriptStore } from '../../src/media/appsScript';

/** A store whose script replies with `reply`; returns the parsed requests too. */
function store(reply: unknown | ((req: Record<string, unknown>) => unknown)) {
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const req = JSON.parse(init!.body as string);
    const body = typeof reply === 'function' ? reply(req) : reply;
    return new Response(typeof body === 'string' ? body : JSON.stringify(body));
  });
  const requests = () => fetch.mock.calls.map(([, init]) => JSON.parse(init!.body as string));
  return { files: new AppsScriptStore('https://script.test/exec', 's3cret', fetch as typeof globalThis.fetch, 0), fetch, requests };
}

describe('AppsScriptStore', () => {
  it('sends the secret and action, and returns the result', async () => {
    const { files, fetch, requests } = store({ result: 'folder-1' });
    expect(await files.folder(['Projects', 'Film'])).toBe('folder-1');
    expect(fetch.mock.calls[0][0]).toBe('https://script.test/exec');
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', redirect: 'manual' });
    expect(requests()).toEqual([{ secret: 's3cret', action: 'folder', path: ['Projects', 'Film'] }]);
  });

  it('reads the reply from the redirect with a GET', async () => {
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
      init?.method === 'POST' ? new Response(null, { status: 302, headers: { location: 'https://output.test/1' } }) : Response.json({ result: `from ${url}` }),
    );
    const files = new AppsScriptStore('https://script.test/exec', 's', fetch as typeof globalThis.fetch);
    expect(await files.folder([])).toBe('from https://output.test/1');
    expect(fetch.mock.calls[1]).toEqual(['https://output.test/1']);
  });

  it('uploads and downloads file contents as base64', async () => {
    const { files, requests } = store((req: Record<string, unknown>) => (req.action === 'upload' ? { result: 'file-1' } : { result: { data: Buffer.from('png!').toString('base64') } }));
    expect(await files.upload({ folderId: 'f', name: 'a.png', mimeType: 'image/png', data: Buffer.from('png!') })).toBe('file-1');
    expect(requests()[0]).toMatchObject({ action: 'upload', folderId: 'f', name: 'a.png', mimeType: 'image/png', data: 'cG5nIQ==' });

    expect(Buffer.from(await files.download('file-1')).toString()).toBe('png!');
  });

  it('creates shortcuts and sends descriptions', async () => {
    const { files, requests } = store({ result: 'shortcut-1' });
    expect(await files.createShortcut({ targetId: 't', folderId: 'f', name: 'a.pdf' })).toBe('shortcut-1');
    await files.update('t', { description: 'Linked to: Projects: Film' });
    expect(requests()).toEqual([
      { secret: 's3cret', action: 'createShortcut', targetId: 't', folderId: 'f', name: 'a.pdf' },
      { secret: 's3cret', action: 'update', id: 't', description: 'Linked to: Projects: Film' },
    ]);
  });

  it('turns script errors into readable errors, never a 401', async () => {
    await expect(store({ error: 'MEDIA_SCRIPT_SECRET does not match the script', status: 401 }).files.verify()).rejects.toMatchObject({
      status: 502,
      message: 'Media script: MEDIA_SCRIPT_SECRET does not match the script',
    });
    await expect(store({ error: 'File not found', status: 404 }).files.download('x')).rejects.toMatchObject({ status: 404 });
  });

  it('retries an HTML reply (the script starting up), then gives up with an explanation', async () => {
    let calls = 0;
    const flaky = store(() => (++calls === 1 ? '<html>Error</html>' : { result: 'ok' }));
    expect(await flaky.files.folder([])).toBe('ok');
    expect(calls).toBe(2);

    const broken = store('<html>Sign in</html>');
    await expect(broken.files.verify()).rejects.toMatchObject({ status: 502, message: expect.stringContaining('MEDIA_SCRIPT_URL') });
    expect(broken.fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry uploads, which could store the file twice', async () => {
    const { files, fetch } = store('<html>Error</html>');
    await expect(files.upload({ folderId: 'f', name: 'a.png', mimeType: 'image/png', data: new Uint8Array([1]) })).rejects.toMatchObject({ status: 502 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('explains when the script cannot be reached', async () => {
    const files = new AppsScriptStore('https://script.test/exec', 's', (async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }) as typeof fetch);
    await expect(files.verify()).rejects.toMatchObject({ status: 502, message: "Can't reach the media script: getaddrinfo ENOTFOUND" });
  });

  it('requires the URL and secret', () => {
    expect(() => createScriptStore({})).toThrow('Set MEDIA_SCRIPT_URL and MEDIA_SCRIPT_SECRET');
    expect(createScriptStore({ MEDIA_SCRIPT_URL: 'https://x', MEDIA_SCRIPT_SECRET: 'y' })).toBeInstanceOf(AppsScriptStore);
  });
});

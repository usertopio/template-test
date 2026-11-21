import { HttpError, type FileStore } from '@profile/core';

// Media files live in the user's Drive, reached through a small Apps Script web app that runs as them
// (backend/apps-script/media-bridge.gs). This avoids an OAuth client, whose tokens expire unless the app is
// published. The script only touches files inside its folder and requires MEDIA_SCRIPT_SECRET.

/** Build the store from env vars. Throws a readable error when misconfigured. */
export function createScriptStore(env = process.env): AppsScriptStore {
  const url = env.MEDIA_SCRIPT_URL?.trim();
  const secret = env.MEDIA_SCRIPT_SECRET?.trim();
  if (!url || !secret) throw new Error('Set MEDIA_SCRIPT_URL and MEDIA_SCRIPT_SECRET (see README: "Media storage")');
  return new AppsScriptStore(url, secret);
}

export class AppsScriptStore implements FileStore {
  constructor(
    private url: string,
    private secret: string,
    private fetchImpl: typeof fetch = fetch,
    private retryDelayMs = 1000,
  ) {}

  /** Check that the script answers, the secret matches and the folder exists. */
  async verify() {
    await this.call('verify');
  }

  folder(path: string[]) {
    return this.call<string>('folder', { path });
  }

  async renameFolder(id: string, name: string) {
    await this.call('renameFolder', { id, name });
  }

  async trashFolderIfEmpty(id: string) {
    await this.call('trashFolderIfEmpty', { id });
  }

  upload({ folderId, name, mimeType, data, description }: { folderId: string; name: string; mimeType: string; data: Uint8Array; description?: string }) {
    return this.call<string>('upload', { folderId, name, mimeType, description, data: Buffer.from(data).toString('base64') });
  }

  async update(id: string, changes: { name?: string; folderId?: string; description?: string }) {
    await this.call('update', { id, ...changes });
  }

  createShortcut({ targetId, folderId, name }: { targetId: string; folderId: string; name: string }) {
    return this.call<string>('createShortcut', { targetId, folderId, name });
  }

  async trash(id: string) {
    await this.call('trash', { id });
  }

  /** A short-lived Drive access token for the folder owner (for large uploads and streaming). */
  async token() {
    return (await this.call<{ token: string }>('token')).token;
  }

  async download(id: string) {
    const { data } = await this.call<{ data: string }>('download', { id });
    return new Uint8Array(Buffer.from(data, 'base64'));
  }

  /**
   * Right after a pause, Google sometimes answers with an HTML error page while the script starts up.
   * Those replies are retried, except uploads: a retry there could store the file twice.
   */
  private async call<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    const attempts = action === 'upload' ? 1 : 3;
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.callOnce<T>(action, params);
      } catch (err) {
        if (!(err instanceof UnexpectedReply) || attempt >= attempts) throw err;
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
      }
    }
  }

  private async callOnce<T>(action: string, params: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ secret: this.secret, action, ...params }),
        redirect: 'manual',
      });
      // The script answers with a redirect to its output, which must be fetched with GET.
      // Node's fetch would repeat the POST there, which Google rejects.
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) res = await this.fetchImpl(location);
    } catch (err) {
      throw new HttpError(502, `Can't reach the media script: ${(err as Error).message}`);
    }
    let body: { result?: T; error?: string; status?: number };
    try {
      body = JSON.parse(await res.text());
    } catch {
      throw new UnexpectedReply();
    }
    if (body.error) {
      // Only "not found" is passed on; a 401 here would log the user out of the app.
      throw new HttpError(body.status === 404 ? 404 : 502, `Media script: ${body.error}`);
    }
    return body.result as T;
  }
}

/** A reply that isn't the script's JSON: a Google error or sign-in page. */
class UnexpectedReply extends HttpError {
  constructor() {
    super(502, 'The media script sent an unexpected reply. Check MEDIA_SCRIPT_URL and that the deployment allows access by "Anyone".');
  }
}

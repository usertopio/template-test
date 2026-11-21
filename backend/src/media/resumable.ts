import { HttpError } from '@profile/core';

// Large files (videos) bypass the media script's single-request limit: they are sent to Drive in pieces
// with Drive's resumable uploads, and streamed back with byte ranges so playback can seek.

export interface ResumableDrive {
  /** Open an upload session for a file of `size` bytes; returns its session URL. */
  startSession(file: { name: string; folderId: string; mimeType: string; size: number; description: string }): Promise<string>;
  /** Send bytes `start`…`start + chunk.length - 1` of `total`; the last piece returns the new file's id. */
  putChunk(session: string, chunk: Uint8Array, start: number, total: number): Promise<{ done: false } | { done: true; fileId: string }>;
  cancel(session: string): Promise<void>;
  /** The file's bytes, optionally a `Range: bytes=…` slice. */
  stream(fileId: string, range?: string): Promise<{ status: number; headers: Record<string, string>; body: ReadableStream<Uint8Array> | null }>;
  /** Drive's own small preview (images, PDFs' first page, video frames), `size` px on the long side; null if Drive has none yet. */
  thumbnail(fileId: string, size: number): Promise<{ contentType: string; data: Uint8Array } | null>;
}

export type ResumableProvider = () => Promise<ResumableDrive>;

/** Drive's REST API with a short-lived access token (from the media script, which runs as the folder owner). */
export class DriveRest implements ResumableDrive {
  private token?: Promise<{ value: string; until: number }>;

  constructor(
    private getToken: () => Promise<string>,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async auth() {
    // Tokens last an hour; renew well before. Requests at the same moment share one renewal.
    const current = this.token && (await this.token.catch(() => undefined));
    if (!current || current.until < Date.now()) {
      this.token = this.getToken().then((value) => ({ value, until: Date.now() + 40 * 60_000 }));
      this.token.catch(() => (this.token = undefined));
    }
    return { Authorization: `Bearer ${(await this.token!).value}` };
  }

  /** A request with the token; if Drive says it's no longer valid (401), once more with a new one. */
  private async authed(url: string, init: RequestInit = {}) {
    const send = async () => this.fetchImpl(url, { ...init, headers: { ...(init.headers as Record<string, string>), ...(await this.auth()) } });
    const res = await send();
    if (res.status !== 401) return res;
    this.token = undefined;
    return send();
  }

  private async failed(res: Response, what: string): Promise<never> {
    const body = await res.text().catch(() => '');
    const message = (() => {
      try {
        return JSON.parse(body).error?.message as string;
      } catch {
        return body.slice(0, 200);
      }
    })();
    throw new HttpError(res.status === 404 ? 404 : 502, `${what}: ${message || res.statusText}`);
  }

  async startSession({ name, folderId, mimeType, size, description }: { name: string; folderId: string; mimeType: string; size: number; description: string }) {
    const res = await this.authed('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mimeType, 'X-Upload-Content-Length': String(size) },
      body: JSON.stringify({ name, parents: [folderId], mimeType, description }),
    });
    const session = res.headers.get('location');
    if (!res.ok || !session) return this.failed(res, 'Drive refused the upload');
    return session;
  }

  async putChunk(session: string, chunk: Uint8Array, start: number, total: number) {
    const res = await this.fetchImpl(session, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes ${start}-${start + chunk.length - 1}/${total}` },
      body: chunk as BodyInit,
      redirect: 'manual', // 308 means "keep going", not a redirect
    });
    if (res.status === 308) return { done: false as const };
    if (!res.ok) return this.failed(res, 'Drive upload failed');
    return { done: true as const, fileId: ((await res.json()) as { id: string }).id };
  }

  async cancel(session: string) {
    await this.fetchImpl(session, { method: 'DELETE' }).catch(() => {});
  }

  async stream(fileId: string, range?: string) {
    const res = await this.authed(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
      headers: range ? { Range: range } : {},
    });
    if (!res.ok) return this.failed(res, 'Drive download failed');
    const headers: Record<string, string> = {};
    for (const h of ['content-length', 'content-range', 'accept-ranges']) {
      const v = res.headers.get(h);
      if (v) headers[h] = v;
    }
    return { status: res.status, headers, body: res.body };
  }

  async thumbnail(fileId: string, size: number) {
    const res = await this.authed(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=thumbnailLink&supportsAllDrives=true`);
    if (!res.ok) return this.failed(res, 'Drive thumbnail lookup failed');
    const { thumbnailLink } = (await res.json()) as { thumbnailLink?: string };
    // Drive makes thumbnails shortly after upload; until then there is none. The link itself is short-lived and
    // works without a token, so it never leaves the server.
    if (!thumbnailLink) return null;
    const image = await this.authed(thumbnailLink.replace(/=s\d+$/, `=s${size}`));
    if (!image.ok) return null;
    return { contentType: image.headers.get('content-type') ?? 'image/jpeg', data: new Uint8Array(await image.arrayBuffer()) };
  }
}

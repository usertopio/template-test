import type { MemoryFileStore } from '@profile/core/testing';
import type { ResumableDrive } from '../../src/media/resumable';

/** Drive's resumable uploads and ranged downloads, on top of the in-memory Drive folder. */
export class MemoryResumable implements ResumableDrive {
  sessions = new Map<string, { file: { name: string; folderId: string; mimeType: string; size: number; description: string }; parts: Uint8Array[] }>();
  cancelled: string[] = [];
  ranges: (string | undefined)[] = [];
  /** Files Drive has made a thumbnail for (by file id), as tests decide. */
  thumbnails = new Set<string>();
  private n = 0;

  constructor(private files: MemoryFileStore) {}

  async startSession(file: { name: string; folderId: string; mimeType: string; size: number; description: string }) {
    const session = `session-${++this.n}`;
    this.sessions.set(session, { file, parts: [] });
    return session;
  }

  async putChunk(session: string, chunk: Uint8Array, start: number, total: number) {
    const s = this.sessions.get(session)!;
    s.parts.push(chunk);
    if (start + chunk.length < total) return { done: false as const };
    const data = new Uint8Array(Buffer.concat(s.parts));
    this.sessions.delete(session);
    return { done: true as const, fileId: await this.files.upload({ ...s.file, data }) };
  }

  async cancel(session: string) {
    this.sessions.delete(session);
    this.cancelled.push(session);
  }

  async stream(fileId: string, range?: string): ReturnType<ResumableDrive['stream']> {
    this.ranges.push(range);
    const data = await this.files.download(fileId);
    const m = range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = m ? Number(m[1]) : 0;
    const end = m?.[2] ? Number(m[2]) : data.length - 1;
    const body = new Blob([data.subarray(start, end + 1) as BlobPart]).stream() as unknown as ReadableStream<Uint8Array>;
    return m
      ? { status: 206, headers: { 'content-range': `bytes ${start}-${end}/${data.length}`, 'content-length': String(end - start + 1) }, body }
      : { status: 200, headers: { 'content-length': String(data.length) }, body };
  }

  async thumbnail(fileId: string, size: number) {
    return this.thumbnails.has(fileId) ? { contentType: 'image/jpeg', data: new TextEncoder().encode(`thumb ${fileId} ${size}`) } : null;
  }
}

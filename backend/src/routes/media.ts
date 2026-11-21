import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import express, { Router, type RequestHandler, type Response } from 'express';
import multer from 'multer';
import { MEDIA_MAX_BYTES, UPLOAD_CHUNK_BYTES, formatLabel, isVideo, type MediaItem } from '@profile/shared';
import { HttpError, detectMediaType, type Api, type MediaPlan } from '@profile/core';
import { signedMediaLink, validMediaLink } from '../auth';
import type { ResumableDrive, ResumableProvider } from '../media/resumable';

/** A large upload in progress: its Drive session and how far it got. Kept in memory for a day. */
interface Upload {
  session: string;
  plan: MediaPlan & { size: number };
  received: number;
  checked: boolean;
  startedAt: number;
}
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const DRIVE_PIECE = 256 * 1024;

/** Parse a multipart upload with one "file" field, kept in memory. */
const receiveFile: RequestHandler = (req, res, next) =>
  multer({ storage: multer.memoryStorage(), limits: { fileSize: MEDIA_MAX_BYTES, files: 1 } }).single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? `Send files over ${MEDIA_MAX_BYTES / 1024 / 1024} MB in pieces` : err.message;
      return next(new HttpError(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400, 'Validation failed', { file: message }));
    }
    next(err);
  });

/** Text says its encoding, or a browser may read Thai in it as Latin-1. */
const contentType = (item: MediaItem) => (item.mimeType === 'text/plain' ? 'text/plain; charset=utf-8' : item.mimeType);

const contentDisposition = (item: MediaItem, download: boolean) =>
  `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(item.fileName)}`;

/** Serve bytes held in memory, honouring a single `Range: bytes=a-b` (used when Drive can't stream directly). */
function sendRange(res: Response, data: Uint8Array, range: string | undefined) {
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return void res.set('Content-Length', String(data.length)).send(Buffer.from(data));
  const start = m[1] ? Number(m[1]) : Math.max(0, data.length - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), data.length - 1) : data.length - 1;
  if (start > end || start >= data.length) return void res.status(416).set('Content-Range', `bytes */${data.length}`).end();
  res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': String(end - start + 1) }).send(Buffer.from(data.subarray(start, end + 1)));
}

/** Streams opened by <video> and download links: signed instead of logged in, so they come before requireAuth. */
export function mediaStreamRouter(api: Api, getResumable?: ResumableProvider): Router {
  const router = Router();

  router.get('/media/:id/stream', async (req, res) => {
    const { exp = '', sig = '' } = req.query as Record<string, string>;
    if (!validMediaLink(req.params.id, exp, sig)) throw new HttpError(403, 'This media link has expired; reload the page');
    const item = await api.getMedia(req.params.id);
    res.set({
      'Content-Type': contentType(item),
      'Content-Disposition': contentDisposition(item, req.query.download === '1'),
      'Cache-Control': 'private, max-age=3600',
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
    });
    const range = typeof req.headers.range === 'string' ? req.headers.range : undefined;
    if (!getResumable) return sendRange(res, (await api.mediaFile(item.id)).data, range);
    const drive = await getResumable();
    const out = await drive.stream(item.fileId, range);
    res.status(out.status).set(out.headers);
    if (!out.body) return void res.end();
    Readable.fromWeb(out.body as unknown as NodeReadableStream).on('error', () => res.destroy()).pipe(res);
  });

  return router;
}

/** Media over HTTP. The work happens in @profile/core. */
export function mediaRouter(api: Api, getResumable?: ResumableProvider): Router {
  const router = Router();
  const uploads = new Map<string, Upload>();

  const drive = async (): Promise<ResumableDrive> => {
    if (!getResumable) throw new HttpError(503, 'Large uploads need the media script (see README: "Media storage")');
    return getResumable();
  };

  // A small preview from Drive, far lighter than the file (e.g. 24 KB for a 650 KB photo); 404 until Drive has made it.
  router.get('/media/:id/thumb', async (req, res) => {
    const size = Math.min(800, Math.max(64, Number(req.query.size) || 200));
    const item = await api.getMedia(req.params.id);
    const thumb = getResumable ? await (await getResumable()).thumbnail(item.fileId, size) : null;
    if (!thumb) throw new HttpError(404, 'No thumbnail yet');
    res.set({ 'Content-Type': thumb.contentType, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' }).send(Buffer.from(thumb.data));
  });

  // A signed link for <video> and downloads (valid for a few hours).
  router.get('/media/:id/stream-url', async (req, res) => {
    const item = await api.getMedia(req.params.id);
    res.json({ url: signedMediaLink(item.id) });
  });

  // Large uploads (videos, big images and PDFs): start, then send the file in pieces of UPLOAD_CHUNK_BYTES.
  router.post('/media/uploads', async (req, res) => {
    for (const [id, u] of uploads) if (Date.now() - u.startedAt > UPLOAD_TTL_MS) uploads.delete(id);
    const plan = await api.startLargeUpload(req.body ?? {});
    const session = await (await drive()).startSession({ name: plan.fileName, folderId: plan.folderId, mimeType: plan.mimeType, size: plan.size, description: plan.driveDescription });
    const uploadId = randomUUID();
    uploads.set(uploadId, { session, plan, received: 0, checked: false, startedAt: Date.now() });
    res.status(201).json({ uploadId, chunkSize: UPLOAD_CHUNK_BYTES });
  });

  // Body: the raw bytes; header Content-Range: bytes <start>-<end>/<total>.
  router.put('/media/uploads/:id', express.raw({ type: 'application/octet-stream', limit: UPLOAD_CHUNK_BYTES + 1024 }), async (req, res) => {
    const upload = uploads.get(req.params.id);
    if (!upload) throw new HttpError(404, 'This upload expired or the server restarted; start it again');
    const m = String(req.headers['content-range'] ?? '').match(/^bytes (\d+)-(\d+)\/(\d+)$/);
    const chunk: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!m || Number(m[3]) !== upload.plan.size || Number(m[2]) - Number(m[1]) + 1 !== chunk.length) throw new HttpError(400, 'Send a Content-Range matching the piece');
    const start = Number(m[1]);
    if (start !== upload.received) return void res.status(409).json({ error: 'Pieces must arrive in order', received: upload.received });
    const last = start + chunk.length === upload.plan.size;
    if (!last && chunk.length % DRIVE_PIECE) throw new HttpError(400, 'Pieces must be a multiple of 256 KB (except the last)');

    const d = await drive();
    if (!upload.checked) {
      // The first bytes decide the real type, whatever the browser said. A video may be any of the three (browsers
      // mislabel .mov); an image or PDF must be what it was named, since its file name was planned with that.
      const type = detectMediaType(chunk);
      const expected = upload.plan.mimeType;
      if (!type || (isVideo(expected) ? !isVideo(type) : type !== expected)) {
        uploads.delete(req.params.id);
        await d.cancel(upload.session);
        throw new HttpError(400, 'Validation failed', { file: isVideo(expected) ? 'Only MP4, MOV or WebM videos' : `This isn't a ${formatLabel(expected)} file` });
      }
      upload.checked = true;
    }
    const result = await d.putChunk(upload.session, chunk, start, upload.plan.size);
    upload.received += chunk.length;
    if (!result.done) return void res.json({ done: false, received: upload.received });
    uploads.delete(req.params.id);
    const { size, ...plan } = upload.plan;
    res.status(201).json({ done: true, item: await api.finishLargeUpload(plan, result.fileId, size) });
  });

  router.delete('/media/uploads/:id', async (req, res) => {
    const upload = uploads.get(req.params.id);
    uploads.delete(req.params.id);
    if (upload) await (await drive()).cancel(upload.session);
    res.status(204).end();
  });

  router.get('/media', async (_req, res) => {
    res.json(await api.listMedia());
  });

  // multipart/form-data: section, entryId, title, description, file
  router.post('/media', receiveFile, async (req, res) => {
    res.status(201).json(await api.addMedia(req.body ?? {}, req.file?.buffer));
  });

  // Before /media/:id, which would otherwise take "order" as an id.
  router.put('/media/order', async (req, res) => {
    res.json(await api.reorderMedia(req.body));
  });

  router.put('/media/:id', async (req, res) => {
    res.json(await api.updateMedia(req.params.id, req.body));
  });

  router.delete('/media/:id', async (req, res) => {
    await api.deleteMedia(req.params.id);
    res.status(204).end();
  });

  router.get('/media/:id/file', async (req, res) => {
    const { item, data } = await api.mediaFile(req.params.id);
    res.set({
      'Content-Type': contentType(item),
      'Content-Disposition': contentDisposition(item, false),
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(Buffer.from(data));
  });

  return router;
}

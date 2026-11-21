import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type ErrorRequestHandler } from 'express';
import { ConfigError, HttpError, createApi, describeError, type FileStoreProvider, type RepoProvider } from '@profile/core';
import { authRouter, requireAuth } from './auth';
import type { ResumableProvider } from './media/resumable';
import { mediaRouter, mediaStreamRouter } from './routes/media';
import { sectionsRouter } from './routes/sections';

export { ConfigError, describeError };

/** Runs tasks one after another in the background, so a request can answer before they finish. */
function backgroundQueue() {
  let tail = Promise.resolve();
  return (task: () => Promise<void>) => {
    tail = tail.then(task).catch((err) => console.error('[api] background task failed:', describeError(err)));
    return Promise.resolve();
  };
}

/**
 * The Express app: the core API over HTTP, the built frontend (when present) and error handling.
 * `background`: answer before Drive follow-ups finish (the real server); tests leave it off so they can check them.
 * `getResumable`: Drive access for large uploads and streaming; without it, videos can't be uploaded in pieces.
 */
export function createApp(getRepos: RepoProvider, getFiles: FileStoreProvider, { background = false, getResumable }: { background?: boolean; getResumable?: ResumableProvider } = {}) {
  const api = createApi({
    getRepos,
    getFiles,
    mediaOwner: process.env.MEDIA_OWNER_NAME?.trim() ?? '',
    defer: background ? backgroundQueue() : undefined,
  });
  const app = express();
  app.set('trust proxy', 1); // behind Render's proxy: use the real client IP for rate limiting
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      res.json(await api.health());
    } catch (err) {
      res.status(503).json({ ok: false, error: describeError(err) });
    }
  });

  // Public: health (used by Render's health check) and login. Everything else needs a token.
  app.use('/api', authRouter());
  app.use('/api', mediaStreamRouter(api, getResumable));
  app.use('/api', requireAuth);
  app.use('/api', sectionsRouter(api));
  app.use('/api', mediaRouter(api, getResumable));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  // In production, serve the built React app (frontend/dist) from the same origin as the API.
  const frontendDist = fileURLToPath(new URL('../../frontend/dist', import.meta.url));
  if (existsSync(join(frontendDist, 'index.html'))) {
    // Hashed build assets never change, so let browsers cache them for a year.
    app.use('/assets', express.static(join(frontendDist, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(frontendDist, { index: false }));
    // Client-side routes (/posts, /experience, …) all load index.html.
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(frontendDist, 'index.html'));
    });
  }

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    // HttpError, ConfigError and Google API errors (e.g. 403 when the sheet isn't shared) all carry a status.
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500 && !(err instanceof ConfigError)) console.error('[api]', err);
    res.status(status).json({ error: describeError(err), fields: err instanceof HttpError ? err.fields : undefined });
  };
  app.use(errorHandler);

  return app;
}

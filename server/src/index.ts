import 'dotenv/config';
import express, { type ErrorRequestHandler } from 'express';
import { createSheetsContext } from './sheets/client';
import { bootstrapSheets } from './sheets/bootstrap';
import type { SheetRepository } from './sheets/repo';
import { HttpError } from './errors';
import { backfillOrganizations } from './organizations';
import { sectionsRouter } from './routes/sections';

class ConfigError extends Error {
  status = 503;
}

// Connect lazily so the server still boots (and /api/health explains why) when .env is incomplete.
let reposPromise: Promise<Map<string, SheetRepository>> | undefined;
function getRepos() {
  reposPromise ??= (async () => {
    let ctx;
    try {
      ctx = createSheetsContext();
    } catch (err) {
      throw new ConfigError((err as Error).message);
    }
    const repos = await bootstrapSheets(ctx);
    // Best effort: a failure here shouldn't block the app.
    await backfillOrganizations(repos).catch((err) => console.error('[sheets] organization backfill failed:', describeError(err)));
    return repos;
  })().catch((err) => {
    reposPromise = undefined; // retry on next request
    throw err;
  });
  return reposPromise;
}

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await getRepos();
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ ok: false, error: describeError(err) });
  }
});

app.use('/api', sectionsRouter(getRepos));

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // HttpError, ConfigError and Google API errors (e.g. 403 when the sheet isn't shared) all carry a status.
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500 && !(err instanceof ConfigError)) console.error('[api]', err);
  res.status(status).json({ error: describeError(err), fields: err instanceof HttpError ? err.fields : undefined });
};
app.use(errorHandler);

function describeError(err: unknown): string {
  const e = err as { message?: string; response?: { data?: { error?: { message?: string } } } };
  return e.response?.data?.error?.message ?? e.message ?? 'Unknown error';
}

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
  getRepos()
    .then(() => console.log('[sheets] connected and tabs ready'))
    .catch((err) => console.error(`[sheets] not ready: ${describeError(err)}`));
});

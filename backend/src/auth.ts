import { createHmac } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { HttpError, login, memoryFailures, safeEqual, validToken, type Hmac } from '@profile/core';

// Password protection over HTTP; tokens and the brute-force limit live in @profile/core.
// POST /api/auth/login exchanges APP_PASSWORD for a token, which the client sends as `Authorization: Bearer <token>`.

const password = () => process.env.APP_PASSWORD ?? '';
const isProduction = () => process.env.NODE_ENV === 'production';
const hmac: Hmac = (key, message) => createHmac('sha256', key).update(message).digest('base64url');
const failures = memoryFailures(); // per client IP

/** Auth is on whenever APP_PASSWORD is set. In production it is mandatory. */
export function authEnabled(): boolean {
  if (!password() && isProduction()) throw new HttpError(503, 'APP_PASSWORD is not set on the server');
  return !!password();
}

export function authRouter(): Router {
  const router = Router();

  router.get('/auth/status', (_req, res) => {
    res.json({ required: authEnabled() });
  });

  router.post('/auth/login', async (req, res) => {
    if (!authEnabled()) return void res.json({ token: '' });
    const token = await login({ hmac, password: password(), attempt: String(req.body?.password ?? ''), client: req.ip ?? 'unknown', failures });
    res.json({ token });
  });

  return router;
}

/** Media streams are opened by <video>, which can't send the login header, so they use short-lived signed links. */
const STREAM_LINK_TTL_MS = 6 * 60 * 60 * 1000;
const mediaSignature = (id: string, expiry: string) => hmac(password(), `parzival-media:${id}:${expiry}`);

export function signedMediaLink(id: string, now = Date.now()): string {
  const expiry = String(now + STREAM_LINK_TTL_MS);
  return `/api/media/${encodeURIComponent(id)}/stream?exp=${expiry}&sig=${mediaSignature(id, expiry)}`;
}

export function validMediaLink(id: string, expiry: string, signature: string, now = Date.now()): boolean {
  return !!expiry && Number(expiry) >= now && safeEqual(signature, mediaSignature(id, expiry));
}

/** Rejects API requests without a valid token (when auth is enabled). */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!authEnabled()) return next();
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  if (!validToken(hmac, password(), token)) return next(new HttpError(401, 'Login required'));
  next();
};

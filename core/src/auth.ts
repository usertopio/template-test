import { HttpError } from './errors';

// Single-user password protection.
// Logging in exchanges the password for a signed token ("<expiry>.<hmac>"). Changing the password revokes all tokens.
// Each runtime supplies the HMAC (Node crypto, Apps Script Utilities) and where failed attempts are counted.

export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_FAILURES = 10;
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;

/** HMAC-SHA256 of `message` keyed with `key`, base64url encoded. */
export type Hmac = (key: string, message: string) => string;

/** Failed login attempts per client, e.g. an in-memory map or Apps Script's CacheService. */
export interface FailureCounter {
  count(client: string): Promise<number>;
  record(client: string): Promise<void>;
  clear(client: string): Promise<void>;
}

/** Compares in time independent of where the strings differ. */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  return diff === 0;
}

const sign = (hmac: Hmac, password: string, expiry: string) => hmac(password, `parzival-profile:${expiry}`);

export function issueToken(hmac: Hmac, password: string, now = Date.now()): string {
  const expiry = String(now + TOKEN_TTL_MS);
  return `${expiry}.${sign(hmac, password, expiry)}`;
}

export function validToken(hmac: Hmac, password: string, token: string, now = Date.now()): boolean {
  const [expiry, mac] = token.split('.');
  if (!expiry || !mac || Number(expiry) < now) return false;
  return safeEqual(mac, sign(hmac, password, expiry));
}

/** Check a login attempt and return a token, with a brute-force limit per client. */
export async function login(opts: { hmac: Hmac; password: string; attempt: string; client: string; failures: FailureCounter }): Promise<string> {
  const { hmac, password, attempt, client, failures } = opts;
  if ((await failures.count(client)) >= MAX_FAILURES) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
  if (!safeEqual(attempt, password)) {
    await failures.record(client);
    throw new HttpError(401, 'Wrong password');
  }
  await failures.clear(client);
  return issueToken(hmac, password);
}

/** Failed attempts kept in memory, forgotten FAILURE_WINDOW_MS after the first one. */
export function memoryFailures(now = () => Date.now()): FailureCounter {
  const failures = new Map<string, { count: number; since: number }>();
  const current = (client: string) => {
    const f = failures.get(client);
    if (f && now() - f.since > FAILURE_WINDOW_MS) failures.delete(client);
    return failures.get(client);
  };
  return {
    async count(client) {
      return current(client)?.count ?? 0;
    },
    async record(client) {
      const f = current(client) ?? { count: 0, since: now() };
      failures.set(client, { ...f, count: f.count + 1 });
    },
    async clear(client) {
      failures.delete(client);
    },
  };
}

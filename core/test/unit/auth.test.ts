import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FAILURE_WINDOW_MS, MAX_FAILURES, TOKEN_TTL_MS, issueToken, login, memoryFailures, safeEqual, validToken, type Hmac } from '../../src';

const hmac: Hmac = (key, message) => createHmac('sha256', key).update(message).digest('base64url');

describe('tokens', () => {
  it('accepts its own tokens until they expire', () => {
    const token = issueToken(hmac, 'pw', 1000);
    expect(validToken(hmac, 'pw', token, 1000)).toBe(true);
    expect(validToken(hmac, 'pw', token, 1000 + TOKEN_TTL_MS)).toBe(true);
    expect(validToken(hmac, 'pw', token, 1001 + TOKEN_TTL_MS)).toBe(false);
  });

  it('rejects tokens signed with another password, tampered or malformed', () => {
    const token = issueToken(hmac, 'pw', 1000);
    expect(validToken(hmac, 'other', token, 1000)).toBe(false);
    const [expiry, mac] = token.split('.');
    expect(validToken(hmac, 'pw', `${Number(expiry) + 1}.${mac}`, 1000)).toBe(false);
    for (const bad of ['', '.', 'abc', `${expiry}.`]) expect(validToken(hmac, 'pw', bad, 1000)).toBe(false);
  });

  it('compares strings exactly', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('login', () => {
  it('returns a valid token for the right password', async () => {
    const token = await login({ hmac, password: 'pw', attempt: 'pw', client: 'ip', failures: memoryFailures() });
    expect(validToken(hmac, 'pw', token)).toBe(true);
  });

  it('locks a client out after too many wrong passwords, until the window passes', async () => {
    let now = 0;
    const failures = memoryFailures(() => now);
    const attempt = (password: string, client = 'ip') => login({ hmac, password: 'pw', attempt: password, client, failures });
    for (let i = 0; i < MAX_FAILURES; i++) await expect(attempt('wrong')).rejects.toMatchObject({ status: 401 });
    await expect(attempt('pw')).rejects.toMatchObject({ status: 429 });
    await expect(attempt('pw', 'other-ip')).resolves.toBeTruthy();

    now += FAILURE_WINDOW_MS + 1;
    await expect(attempt('pw')).resolves.toBeTruthy();
  });

  it('forgets earlier failures after a successful login', async () => {
    const failures = memoryFailures();
    await login({ hmac, password: 'pw', attempt: 'x', client: 'ip', failures }).catch(() => {});
    await login({ hmac, password: 'pw', attempt: 'pw', client: 'ip', failures });
    expect(await failures.count('ip')).toBe(0);
  });
});

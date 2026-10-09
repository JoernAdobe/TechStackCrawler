import assert from 'node:assert/strict';
import test from 'node:test';
import { clearImsCache, validateImsToken } from '../src/mcp/imsAuth.js';

const NOW = 1_800_000_000_000;

function jwt(payload: Record<string, unknown>): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'RS256' })}.${enc(payload)}.signature`;
}

const validPayload = {
  type: 'access_token',
  client_id: 'coworker',
  created_at: String(NOW - 60_000),
  expires_in: String(3_600_000),
};

function mockFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; auth: string | undefined }> = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: (init?.headers as Record<string, string>)?.Authorization });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

test('accepts a valid Adobe IMS user token and caches the result', async () => {
  clearImsCache();
  const token = jwt(validPayload);
  const { fn, calls } = mockFetch(200, { email: 'Jane@Adobe.com', email_verified: true, sub: 'u1' });

  const first = await validateImsToken(token, fn, NOW);
  const second = await validateImsToken(token, fn, NOW + 1_000);

  assert.deepEqual(first, { email: 'jane@adobe.com', userId: 'u1', clientId: 'coworker' });
  assert.deepEqual(second, first);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/ims\/userinfo\/v2$/);
  assert.equal(calls[0].auth, `Bearer ${token}`);
});

test('rejects users outside the allowed email domains', async () => {
  clearImsCache();
  const { fn } = mockFetch(200, { email: 'someone@example.com', email_verified: true });
  assert.equal(await validateImsToken(jwt(validPayload), fn, NOW), null);
});

test('rejects tokens IMS does not accept', async () => {
  clearImsCache();
  const { fn } = mockFetch(401, { error: 'invalid_token' });
  assert.equal(await validateImsToken(jwt(validPayload), fn, NOW), null);
});

test('rejects expired, non-access and malformed tokens without calling IMS', async () => {
  clearImsCache();
  const { fn, calls } = mockFetch(200, { email: 'jane@adobe.com' });
  const expired = jwt({ ...validPayload, created_at: String(NOW - 7_200_000) });
  const idToken = jwt({ ...validPayload, type: 'id_token' });

  assert.equal(await validateImsToken(expired, fn, NOW), null);
  assert.equal(await validateImsToken(idToken, fn, NOW), null);
  assert.equal(await validateImsToken('not-a-jwt', fn, NOW), null);
  assert.equal(calls.length, 0);
});

test('does not cache beyond token expiry', async () => {
  clearImsCache();
  const shortLived = jwt({ ...validPayload, created_at: String(NOW), expires_in: '10000' });
  const { fn, calls } = mockFetch(200, { email: 'jane@adobe.com', email_verified: true });

  assert.ok(await validateImsToken(shortLived, fn, NOW));
  assert.equal(await validateImsToken(shortLived, fn, NOW + 20_000), null);
  assert.equal(calls.length, 1);
});

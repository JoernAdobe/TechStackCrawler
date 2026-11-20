import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { after } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';

process.env.DB_PATH = ':memory:';
process.env.BRIEFING_POLL_MS = '600000';
process.env.SESSION_SECRET = 'test-secret';
process.env.ADMIN_EMAILS = 'Fixed@adobe.com';

const { initDb, closeDb } = await import('../src/db/index.js');
const { createAdminRoutes } = await import('../src/routes/admins.js');
const { createAuthRoutes } = await import('../src/routes/oktaAuth.js');
const { createSession } = await import('../src/services/sessionStore.js');
const { errorHandler } = await import('../src/utils/http.js');
const { config } = await import('../src/config.js');

await initDb();
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(createAdminRoutes());
app.use(createAuthRoutes());
app.use(errorHandler);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(async () => {
  server.close();
  await closeDb();
});

// isAdmin im Token ist bewusst irrelevant: der Status wird live geprüft.
const cookieFor = (email: string) => ({ cookie: `ts_session=${createSession(email, false)}` });
const call = (email: string | null, method: string, path = '', body?: unknown) =>
  fetch(`${base}/api/dashboard/admins${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(email ? cookieFor(email) : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
const sessionOf = async (email: string) =>
  (await (await fetch(`${base}/api/dashboard/session`, { headers: cookieFor(email) })).json()) as { isAdmin: boolean };

test('owner daudert@adobe.com is always a fixed admin, plus ADMIN_EMAILS', async () => {
  assert.deepEqual(config.adminEmails, ['daudert@adobe.com', 'fixed@adobe.com']);
  const res = await call('daudert@adobe.com', 'GET');
  assert.equal(res.status, 200);
  const list = (await res.json()) as Array<{ email: string; fixed: boolean; isSelf: boolean }>;
  assert.deepEqual(list.map((a) => [a.email, a.fixed, a.isSelf]), [
    ['daudert@adobe.com', true, true],
    ['fixed@adobe.com', true, false],
  ]);
});

test('requires an Okta session and live admin rights', async () => {
  assert.equal((await call(null, 'GET')).status, 401);
  assert.equal((await call('jane@adobe.com', 'GET')).status, 403);
  assert.equal((await sessionOf('jane@adobe.com')).isAdmin, false);
});

test('admins can add and remove admins; changes apply immediately', async () => {
  assert.equal((await call('daudert@adobe.com', 'POST', '', { email: ' Jane@Adobe.com ' })).status, 201);
  assert.equal((await call('daudert@adobe.com', 'POST', '', { email: 'jane@adobe.com' })).status, 200);
  assert.equal((await sessionOf('jane@adobe.com')).isAdmin, true);
  assert.equal((await call('jane@adobe.com', 'GET')).status, 200);

  const list = (await (await call('jane@adobe.com', 'GET')).json()) as Array<{ email: string; fixed: boolean; addedBy: string }>;
  assert.deepEqual(list.at(-1), { ...list.at(-1), email: 'jane@adobe.com', fixed: false, addedBy: 'daudert@adobe.com' });

  assert.equal((await call('daudert@adobe.com', 'DELETE', '/jane%40adobe.com')).status, 204);
  assert.equal((await call('jane@adobe.com', 'GET')).status, 403);
  assert.equal((await call('daudert@adobe.com', 'DELETE', '/jane%40adobe.com')).status, 404);
});

test('rejects invalid emails, removing fixed admins and removing yourself', async () => {
  assert.equal((await call('daudert@adobe.com', 'POST', '', { email: 'not-an-email' })).status, 400);
  assert.equal((await call('daudert@adobe.com', 'DELETE', '/daudert%40adobe.com')).status, 400);
  assert.equal((await call('fixed@adobe.com', 'DELETE', '/daudert%40adobe.com')).status, 400);

  await call('daudert@adobe.com', 'POST', '', { email: 'self@adobe.com' });
  assert.equal((await call('self@adobe.com', 'DELETE', '/self%40adobe.com')).status, 400);
  assert.equal((await call('self@adobe.com', 'GET')).status, 200);
});

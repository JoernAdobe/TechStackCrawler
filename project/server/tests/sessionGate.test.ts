import assert from 'node:assert/strict';
process.env.SESSION_SECRET = 'test-secret';
import type { AddressInfo } from 'node:net';
import test, { after } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';

const { createSessionGate } = await import('../src/routes/sessionGate.js');
const { createSession } = await import('../src/services/sessionStore.js');

let enabled = true;
const app = express();
app.use(cookieParser());
app.use(createSessionGate(() => enabled));
app.use((_req, res) => res.json({ ok: true }));
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => server.close());

test('blocks /api without session, allows with cookie or bearer session', async () => {
  const anon = await fetch(`${base}/api/analyses`);
  assert.equal(anon.status, 401);
  assert.equal((await anon.json()).code, 'auth_required');

  const token = createSession('user@adobe.com', false);
  assert.equal((await fetch(`${base}/api/analyses`, { headers: { cookie: `ts_session=${token}` } })).status, 200);
  assert.equal((await fetch(`${base}/api/analyses`, { headers: { authorization: `Bearer ${token}` } })).status, 200);
});

test('keeps login, health, token-protected and non-API paths open', async () => {
  for (const p of ['/api/health', '/api/dashboard/session', '/api/internal/savings-events', '/api/integration/library', '/auth/login', '/mcp', '/']) {
    assert.equal((await fetch(`${base}${p}`)).status, 200, p);
  }
});

test('no-op when OIDC is not configured', async () => {
  enabled = false;
  assert.equal((await fetch(`${base}/api/analyses`)).status, 200);
  enabled = true;
});

test('session tokens survive a restart, expire, reject tampering and honour logout', async () => {
  const { getSession, destroySession } = await import('../src/services/sessionStore.js');
  const token = createSession('user@adobe.com', false);
  // Neustart simulieren: frische Modulinstanz mit demselben Secret.
  const fresh = await import(`../src/services/sessionStore.js?restart=${Date.now()}`);
  assert.equal(fresh.getSession(token)?.email, 'user@adobe.com');

  assert.equal(getSession(createSession('old@adobe.com', false, -1)), null);
  const [payload, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ e: 'boss@adobe.com', a: true, x: Date.now() + 1e6 })).toString('base64url');
  assert.equal(getSession(`${forged}.${sig}`), null);
  assert.equal(getSession(`${payload}.${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`), null);

  destroySession(token);
  assert.equal(getSession(token), null);
});

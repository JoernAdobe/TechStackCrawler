import assert from 'node:assert/strict';
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

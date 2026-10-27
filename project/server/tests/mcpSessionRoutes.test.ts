/**
 * MCP Streamable HTTP: unbekannte Session-IDs (z. B. nach Pod-Neustart) müssen 404 liefern,
 * damit das Coworker-Gateway neu initialisiert statt die Tools des Servers zu verlieren.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';

process.env.DB_PATH = ':memory:';

const { createMcpRoutes } = await import('../src/mcp/server.js');

const app = express();
app.use(express.json());
app.use('/mcp', createMcpRoutes());
const httpServer = app.listen(0);
const url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/mcp`;

after(() => {
  httpServer.closeAllConnections();
  httpServer.close();
});

const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};
const STALE = '00000000-0000-0000-0000-000000000000';
const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
};

test('POST mit unbekannter Session-ID → 404', async () => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Mcp-Session-Id': STALE },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  });
  assert.equal(res.status, 404);
});

test('GET und DELETE mit unbekannter Session-ID → 404, ohne Session-ID → 400', async () => {
  for (const method of ['GET', 'DELETE']) {
    const stale = await fetch(url, { method, headers: { ...headers, 'Mcp-Session-Id': STALE } });
    assert.equal(stale.status, 404, method);
    const missing = await fetch(url, { method, headers });
    assert.equal(missing.status, 400, method);
  }
});

test('initialize mit veralteter Session-ID legt eine neue Session an', async () => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Mcp-Session-Id': STALE },
    body: JSON.stringify(initialize),
  });
  assert.equal(res.status, 200);
  const sid = res.headers.get('mcp-session-id');
  assert.ok(sid && sid !== STALE);
  await res.text();
});

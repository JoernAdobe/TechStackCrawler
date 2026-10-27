import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { after } from 'node:test';
import express from 'express';

process.env.DB_PATH = ':memory:';
process.env.BRIEFING_POLL_MS = '600000';
process.env.ADMIN_EMAILS = 'boss@adobe.com';

const { initDb, getPool, closeDb } = await import('../src/db/index.js');
const { insertUsageEvent } = await import('../src/db/usageEvents.js');
const { createSavingsEventsRoutes } = await import('../src/routes/savingsEvents.js');
const { hashId } = await import('../src/services/savingsEvents.js');

await initDb();
const db = getPool()!;

const app = express();
app.use(createSavingsEventsRoutes());
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

after(async () => {
  server.close();
  await closeDb();
});

const T0 = Date.UTC(2026, 9, 20, 10);
const ev = (offsetMin: number, visitorId: string, event: string, extra: { email?: string; analysisId?: number; status?: number } = {}) =>
  insertUsageEvent(db, { tsMs: T0 + offsetMin * 60_000, visitorId, event, email: extra.email ?? null, analysisId: extra.analysisId ?? null, status: extra.status ?? 200 });

await ev(0, 'a'.repeat(32), 'analysis', { email: ' Jane@Adobe.com ' });
await ev(1, 'b'.repeat(32), 'use_cases');
await ev(2, 'b'.repeat(32), 'export_pdf', { analysisId: 7 });
await ev(3, 'b'.repeat(32), 'analysis', { status: 500 }); // fehlgeschlagen
await ev(4, 'b'.repeat(32), 'visit');
await ev(5, 'mcp', 'mcp_call');
await ev(6, 'integration', 'rfp_context');
await ev(7, 'c'.repeat(32), 'analysis'); // Admin-Besucher (s. u.)
await ev(8, 'c'.repeat(32), 'visit', { email: 'boss@adobe.com' });
await ev(9, 'mcp', 'analysis');

const iso = (offsetMin: number) => new Date(T0 + offsetMin * 60_000).toISOString();
await db.execute(
  `INSERT INTO briefing_jobs (analysis_id, status, sections_json, created_by, created_at, finished_at) VALUES (?, ?, '[]', ?, ?, ?)`,
  [7, 'done', 'jane@adobe.com', iso(10), iso(20)],
);
await db.execute(
  `INSERT INTO briefing_jobs (analysis_id, status, sections_json, created_by, created_at, finished_at) VALUES (?, ?, '[]', ?, ?, ?)`,
  [8, 'error', 'jane@adobe.com', iso(10), iso(21)],
);
const { insertId: batchId } = await db.execute(
  `INSERT INTO batches (kind, title, status, meta_json, created_by, created_at, updated_at) VALUES ('account', 'ACME', 'done', '{}', 'mcp', ?, ?)`,
  [iso(0), iso(0)],
);
for (const [pos, status] of [[0, 'done'], [1, 'failed']] as const) {
  await db.execute(
    `INSERT INTO batch_items (batch_id, position, url, status, analysis_id, finished_at) VALUES (?, ?, 'https://acme.example', ?, ?, ?)`,
    [batchId, pos, status, 11 + pos, iso(30 + pos)],
  );
}

const get = (query = '', token?: string) =>
  fetch(`${base}/api/internal/savings-events${query}`, token ? { headers: { authorization: `Bearer ${token}` } } : {});

test('savings-events: 503 ohne Secret, 401 bei fehlendem/falschem Token', async () => {
  delete process.env.SAVINGS_EVENTS_TOKEN;
  const disabled = await get('', 'x');
  assert.equal(disabled.status, 503);
  assert.deepEqual(await disabled.json(), { detail: 'savings events disabled' });

  process.env.SAVINGS_EVENTS_TOKEN = 'secret';
  assert.equal((await get()).status, 401);
  assert.equal((await get('', 'wrong')).status, 401);
  assert.equal((await get('?since=garbage', 'secret')).status, 400);
});

test('savings-events: mappt Capabilities, schließt Admin/System aus, filtert Zeitfenster', async () => {
  process.env.SAVINGS_EVENTS_TOKEN = 'secret';
  const res = await get('', 'secret');
  assert.equal(res.status, 200);
  const body = (await res.json()) as { tool: string; generated_at: string; events: Array<Record<string, unknown>> };
  assert.equal(body.tool, 'radar');
  assert.match(body.generated_at, /Z$/);

  const byId = new Map(body.events.map((e) => [e.external_id, e]));
  assert.deepEqual([...byId.keys()].sort(), ['batchitem:1', 'briefing:1', 'ue:1', 'ue:2', 'ue:3']);

  assert.deepEqual(byId.get('ue:1'), {
    external_id: 'ue:1', capability: 'tech_stack_analysis', occurred_at: iso(0),
    user_hash: hashId('jane@adobe.com'), units: 1, dedupe_key: 'ue:1', meta: {},
  });
  assert.equal(byId.get('ue:2')!.capability, 'use_case_discovery');
  assert.equal(byId.get('ue:2')!.user_hash, `v:${hashId('b'.repeat(32))}`);
  assert.equal(byId.get('ue:3')!.capability, 'export');
  assert.deepEqual(byId.get('ue:3')!.meta, { kind: 'export_pdf', analysis_id: 7 });
  assert.equal(byId.get('briefing:1')!.capability, 'account_briefing');
  assert.equal(byId.get('briefing:1')!.occurred_at, iso(20));
  assert.equal(byId.get('briefing:1')!.dedupe_key, 'analysis:7');
  assert.equal(byId.get('batchitem:1')!.capability, 'batch_assessment');
  assert.equal(byId.get('batchitem:1')!.user_hash, '');
  assert.equal(byId.get('batchitem:1')!.dedupe_key, 'analysis:11');
  assert.ok(!JSON.stringify(body).includes('@'), 'keine E-Mails im Payload');

  const windowed = (await (await get(`?since=${iso(1)}&until=${iso(20)}`, 'secret')).json()) as { events: Array<{ external_id: string }> };
  assert.deepEqual(windowed.events.map((e) => e.external_id), ['ue:2', 'ue:3']); // until exklusiv
});

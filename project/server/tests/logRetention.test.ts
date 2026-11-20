import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import type { Request } from 'express';

process.env.DB_PATH = ':memory:';
process.env.BRIEFING_POLL_MS = '600000';

const { initDb, getPool, closeDb } = await import('../src/db/index.js');
const { insertUsageEvent, listUsageEvents } = await import('../src/db/usageEvents.js');
const { purgeExpiredLogs } = await import('../src/services/logRetention.js');
const { computeUsageStats } = await import('../src/services/usageStats.js');
const { requireMcpAuth } = await import('../src/mcp/auth.js');

await initDb();
const db = getPool()!;
after(() => closeDb());

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 20, 12); // Freitag
const ADMINS = ['boss@adobe.com'];
const ev = (daysAgo: number, visitorId: string, event: string, extra: { email?: string; status?: number; analysisId?: number } = {}) =>
  insertUsageEvent(db, {
    tsMs: NOW - daysAgo * DAY, visitorId, event, email: extra.email ?? null, analysisId: extra.analysisId ?? null, status: extra.status ?? 200,
  });

await ev(60, 'a', 'visit', { email: 'jane@adobe.com' });
await ev(60, 'a', 'analysis');
await ev(45, 'a', 'visit');
await ev(45, 'b', 'visit');
await ev(45, 'b', 'export_pdf', { analysisId: 3 });
await ev(45, 'b', 'analysis', { status: 500 });
await ev(45, 'adm', 'analysis', { email: 'boss@adobe.com' });
await ev(45, 'mcp', 'mcp_call');
await ev(5, 'a', 'visit');
await ev(5, 'c', 'analysis');

test('purge archiviert alte Wochen anonym, löscht nur Events älter als die Retention und ist idempotent', async () => {
  await db.execute(`INSERT INTO analysis_runs (request_id, url, status, created_ms, updated_ms) VALUES ('old', 'https://x', 'done', ?, ?)`, [NOW - 40 * DAY, NOW - 40 * DAY]);
  await db.execute(`INSERT INTO analysis_runs (request_id, url, status, created_ms, updated_ms) VALUES ('new', 'https://x', 'done', ?, ?)`, [NOW - DAY, NOW - DAY]);
  const before = await computeUsageStats(db, [], ADMINS, NOW);

  const r = await purgeExpiredLogs(db, { retentionDays: 30, adminEmails: ADMINS, now: NOW });
  assert.equal(r.deletedUsageEvents, 8);
  assert.equal(r.deletedAnalysisRuns, 1);
  assert.equal(r.archivedWeeks.length, 2);
  assert.deepEqual((await listUsageEvents(db, 0)).map((e) => e.visitor_id), ['a', 'c']);

  const { rows } = await db.execute('SELECT * FROM usage_weekly ORDER BY week');
  const weeks = rows as Array<Record<string, unknown>>;
  assert.ok(!JSON.stringify(weeks).includes('@'), 'keine E-Mails im Archiv');
  assert.ok(!JSON.stringify(weeks).includes('"a"'), 'keine Besucher-IDs im Archiv');
  assert.deepEqual(
    weeks.map((w) => [w.active_users, w.new_users, w.returning_users, w.visits, JSON.parse(String(w.features_json))]),
    [
      [1, 1, 0, 1, { analysis: 1 }],
      [2, 1, 1, 2, { export_pdf: 1, mcp_call: 1 }], // Admin + Fehler-Status ausgeschlossen
    ],
  );

  const again = await purgeExpiredLogs(db, { retentionDays: 30, adminEmails: ADMINS, now: NOW + DAY });
  assert.deepEqual([again.archivedWeeks, again.deletedUsageEvents], [[], 0]);

  // Dashboard-Historie bleibt über den Purge hinweg erhalten.
  const afterPurge = await computeUsageStats(db, [], ADMINS, NOW);
  assert.deepEqual(afterPurge.usersPerWeek.slice(0, 2), before.usersPerWeek.slice(0, 2)); // archivierte Wochen exakt
  // Live-Woche: aktive Nutzer stimmen; „neu“ kennt nach dem Purge nur noch das Aufbewahrungsfenster.
  assert.equal(afterPurge.usersPerWeek[2].activeUsers, before.usersPerWeek[2].activeUsers);
  assert.deepEqual(afterPurge.featureUsage.map((f) => [f.name, f.total]), before.featureUsage.map((f) => [f.name, f.total]));
  assert.deepEqual([afterPurge.exports, afterPurge.integrations], [before.exports, before.integrations]);
  assert.equal(afterPurge.trackingSince, before.trackingSince);
});

test('purge hält mindestens 7 Tage vor, auch bei kleinerem RETENTION_LOG_DAYS', async () => {
  const r = await purgeExpiredLogs(db, { retentionDays: 1, adminEmails: ADMINS, now: NOW });
  assert.equal(r.cutoffMs, NOW - 7 * DAY);
  assert.equal((await listUsageEvents(db, 0)).length, 2);
});

test('mcp-auth: abgelehnte Zugriffe werden ohne IP-Adresse geloggt', async () => {
  const logs: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => void logs.push(args.join(' '));
  try {
    const req = { method: 'POST', headers: { 'user-agent': 'test-client' }, ip: '203.0.113.7' } as unknown as Request;
    await assert.rejects(requireMcpAuth(req, {} as never, () => {}));
  } finally {
    console.warn = warn;
  }
  assert.equal(logs.length, 1);
  assert.match(logs[0], /\[mcp-auth\] rejected .*ua="test-client"/);
  assert.ok(!logs[0].includes('203.0.113.7') && !logs[0].includes('ip='));
});

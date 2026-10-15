import assert from 'node:assert/strict';
import test from 'node:test';
import type { DbHandle } from '../src/db/types.js';

// Config wird beim Import gelesen → Env vor dem dynamischen Import setzen.
process.env.OBSERVEPOINT_API_KEY = 'test-key';
process.env.OBSERVEPOINT_ALLOW_CREATE = '1';
process.env.OBSERVEPOINT_SCRATCH_AUDIT_ID = '99';
process.env.OBSERVEPOINT_RETRY_BASE_MS = '0';

const auto = await import('../src/services/observepoint/autoScan.js');

/** Minimaler In-Memory-DbHandle für SELECT/UPDATE auf analyses. */
function fakeDb(rows: Map<number, { url: string; json: unknown }>): DbHandle {
  return {
    dialect: 'sqlite',
    async execute(sql, params = []) {
      if (/^\s*UPDATE analyses/i.test(sql)) {
        const [json, id] = params as [string, number];
        rows.get(id)!.json = JSON.parse(json);
        return { rows: [] };
      }
      if (/WHERE id = \?/i.test(sql)) {
        const id = params[0] as number;
        const r = rows.get(id);
        return { rows: r ? [{ id, url: r.url, result_json: JSON.stringify(r.json), analyzed_at: '2026-10-15', created_at: '2026-10-15' }] : [] };
      }
      return {
        rows: [...rows.entries()].map(([id, r]) => ({ id, url: r.url, result_json: JSON.stringify(r.json), analyzed_at: '2026-10-15', created_at: '2026-10-15' })),
      };
    },
  };
}

function analysis(url: string) {
  return { url, analyzedAt: '2026-10-15T09:00:00Z', technologies: [], rawDetections: [], summary: '' };
}

/** Fake-ObservePoint: kein Audit für die Domain, Scratch-Audit 99, Run 500 wird nach dem 2. Poll fertig. */
function fakeOp() {
  const calls: string[] = [];
  let polls = 0;
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const route = `${init?.method ?? 'GET'} ${url.pathname}`;
    calls.push(route);
    if (route === 'GET /v3/web-audits' || route === 'GET /v2/domains' || route === 'GET /v2/tags') return json([]);
    if (route === 'GET /v2/web-audits/99') return json({ id: 99, name: 'https://www.example.org/', webAuditRunning: false, startingUrls: [] });
    if (route === 'PUT /v2/web-audits/99') return json(JSON.parse(String(init?.body)));
    if (route === 'POST /v2/web-audits/99/runs') return json({ id: 500 });
    if (route === 'GET /v2/web-audits/99/runs') {
      polls++;
      return json([{ id: 500, webAuditId: 99, started: '2026-10-15T09:00:00Z', completed: polls >= 2 ? '2026-10-15T09:05:00Z' : null, totalUrl: 5 }]);
    }
    if (url.pathname.endsWith('/reports/tag-inventory/tags')) {
      return json({ tags: [{ tagId: 1, tagName: 'Adobe Analytics', tagCategoryName: 'Analytics', tagPresentPageCount: 5 }] });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  return { calls };
}

async function until(cond: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 5));
  }
}

test('auto-scan: no audit → queued fresh scan → result saved automatically', async () => {
  auto.__setAutoScanDeps({ sleep: () => Promise.resolve(), pollMs: 0, busyWaitMs: 0 });
  const { calls } = fakeOp();
  const rows = new Map([[1, { url: 'https://www.example.org/', json: analysis('https://www.example.org/') as unknown }]]);
  const db = fakeDb(rows);

  await auto.autoObservePoint(db, 1, 'https://www.example.org/');
  await until(() => (rows.get(1)!.json as any).enrichments?.observepoint?.status === 'done');

  const op = (rows.get(1)!.json as any).enrichments.observepoint;
  assert.equal(op.auto, true);
  assert.equal(op.runId, 500);
  assert.equal(op.reused, false);
  assert.deepEqual(op.tags.map((t: { name: string }) => t.name), ['Adobe Analytics']);
  assert.ok((rows.get(1)!.json as any).enrichments.evidenceMatrix, 'evidence matrix is rebuilt');
  assert.ok(calls.includes('PUT /v2/web-audits/99'), 'scratch audit is pointed at the URL');
  assert.equal(calls.filter((c) => c === 'POST /v2/web-audits/99/runs').length, 1, 'exactly one scan started');
  assert.equal(auto.autoScanQueueSize(), 0);
});

test('auto-scan: same domain twice → one scan, both analyses updated', async () => {
  auto.__setAutoScanDeps({ sleep: () => new Promise((r) => setTimeout(r, 2)), pollMs: 0, busyWaitMs: 0 });
  const { calls } = fakeOp();
  const rows = new Map([
    [1, { url: 'https://www.example.org/', json: analysis('https://www.example.org/') as unknown }],
    [2, { url: 'https://example.org/', json: analysis('https://example.org/') as unknown }],
  ]);
  const db = fakeDb(rows);

  await Promise.all([auto.enqueueFreshScan(db, 1, 'https://www.example.org/'), auto.enqueueFreshScan(db, 2, 'https://example.org/')]);
  await until(() => [1, 2].every((id) => (rows.get(id)!.json as any).enrichments?.observepoint?.status === 'done'));
  assert.equal(calls.filter((c) => c === 'POST /v2/web-audits/99/runs').length, 1);
});

test('auto-scan: resume picks up pending scans after a restart', async () => {
  auto.__setAutoScanDeps({ sleep: () => Promise.resolve(), pollMs: 0, busyWaitMs: 0 });
  const { calls } = fakeOp();
  const pending = {
    ...analysis('https://www.example.org/'),
    enrichments: { observepoint: { url: 'https://www.example.org/', domain: 'example.org', status: 'running', auto: true, runId: 500, reused: false, tags: [], fetchedAt: '' } },
  };
  const rows = new Map([[7, { url: 'https://www.example.org/', json: pending as unknown }]]);
  const resumed = await auto.resumeAutoScans(fakeDb(rows));
  assert.equal(resumed, 1);
  await until(() => (rows.get(7)!.json as any).enrichments.observepoint.status === 'done');
  assert.ok(!calls.includes('POST /v2/web-audits/99/runs'), 'a known run is only polled, not restarted');
});

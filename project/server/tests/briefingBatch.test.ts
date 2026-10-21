import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { after, beforeEach } from 'node:test';
import express from 'express';
import JSZip from 'jszip';
import type { AnalysisResult } from '../src/types/analysis.js';
import type { BriefingJob, BriefingStateResponse } from '../src/types/briefing.js';
import type { BatchEnrichmentOptions } from '../src/types/batchAccount.js';
import type { BatchJob } from '../src/types/parity.js';

process.env.DB_PATH = ':memory:';
process.env.BRIEFING_POLL_MS = '600000';

const { initDb, getPool, closeDb } = await import('../src/db/index.js');
const { saveAnalysis } = await import('../src/db/analyses.js');
const batchesDb = await import('../src/db/batches.js');
const { processItem, initialEnrichmentState } = await import('../src/services/batchRunner.js');
const { createEnrichmentState, resolveEnrichmentOptions } = await import('../src/services/batchEnrichment.js');
const bb = await import('../src/services/batchBriefing.js');
const { createBatchRoutes } = await import('../src/routes/batches.js');
const { errorHandler } = await import('../src/utils/http.js');

await initDb();
const db = getPool()!;

const app = express();
app.use(express.json());
app.use(createBatchRoutes());
app.use(errorHandler);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

after(async () => {
  bb.setBriefingDeps(null);
  server.close();
  await closeDb();
});

function job(id: number, analysisId: number, status: BriefingJob['status'] = 'queued'): BriefingJob {
  return { id, analysisId, status, sections: ['s14'], progress: [], createdAt: new Date().toISOString() };
}

let nextJobId = 100;
let enqueued: Array<{ analysisId: number; sections: string[]; createdBy?: string; batchId?: number }> = [];
beforeEach(() => {
  enqueued = [];
  bb.setBriefingDeps({
    enqueueBriefing: async (input) => {
      enqueued.push(input);
      return job(nextJobId++, input.analysisId);
    },
  });
});

const NO_SOURCES: Omit<BatchEnrichmentOptions, 'briefing' | 'maxCostlyItems'> = {
  traffic: false,
  semrush: false,
  observepoint: false,
  mobileApps: false,
  lighthouse: false,
  geo: false,
  useCases: false,
  multiPage: false,
};

async function newAnalysis(host: string): Promise<number> {
  const result: AnalysisResult = { url: `https://${host}/`, analyzedAt: new Date().toISOString(), summary: '', categories: [], rawDetections: [] };
  return saveAnalysis(db, result);
}

async function makeBatch(n: number, opts: Partial<BatchEnrichmentOptions>, aiAnalysis = false): Promise<number> {
  return batchesDb.createBatch(db, {
    kind: 'bulk',
    title: 'Briefing test',
    status: 'running',
    aiAnalysis,
    createdBy: 'tester@adobe.com',
    enrichmentOptions: { ...NO_SOURCES, maxCostlyItems: 50, briefing: true, ...opts },
    items: Array.from({ length: n }, (_, i) => ({ url: `https://site${i}.example.com/`, label: `Brand ${i}` })),
  });
}

/** Lässt alle Items mit Fake-Scannern laufen; failIdx-Items scheitern, Detection liefert keine Analyse. */
async function runBatch(batchId: number, failIdx: Set<number> = new Set()) {
  const header = (await batchesDb.getBatchHeader(db, batchId))!;
  const state = createEnrichmentState();
  const calls = { full: 0, detection: 0 };
  let idx = 0;
  for (;;) {
    const item = await batchesDb.claimNextItem(db, batchId);
    if (!item) break;
    const fail = failIdx.has(idx++);
    await processItem(db, item, header, state, undefined, {
      full: async (url) => {
        calls.full++;
        if (fail) throw new Error('boom');
        return { analysisId: await newAnalysis(new URL(url).hostname), detections: [], raw: [], scanWarnings: [] };
      },
      detection: async () => {
        calls.detection++;
        if (fail) throw new Error('boom');
        return { detections: [], raw: [], scanWarnings: [] };
      },
    });
  }
  return { calls, batch: (await batchesDb.getBatch(db, batchId))! };
}

test('options: briefing defaults to false and old batches stay compatible', () => {
  const o = resolveEnrichmentOptions('bulk', false);
  assert.equal(o.briefing, false);
  assert.equal(o.briefingSections, undefined);
  assert.equal(bb.briefingCap(o), 0);
  const legacy = { ...NO_SOURCES, maxCostlyItems: 5 } as unknown as BatchEnrichmentOptions;
  assert.equal(bb.briefingCap(legacy), 0);
  assert.equal(bb.briefingCap(undefined), 0);

  const on = resolveEnrichmentOptions('account', true, { briefing: true, briefingSections: ['s03', 's01'] });
  assert.equal(on.briefing, true);
  assert.deepEqual(on.briefingSections, ['s01', 's03', 's14']);
  assert.deepEqual(resolveEnrichmentOptions('account', true, { briefing: true }).briefingSections?.length, 14);
});

test('cap: min(maxCostlyItems, 20)', () => {
  const o = (max: number) => ({ ...NO_SOURCES, briefing: true, maxCostlyItems: max }) as BatchEnrichmentOptions;
  assert.equal(bb.briefingCap(o(5)), 5);
  assert.equal(bb.briefingCap(o(50)), 20);
  assert.equal(bb.MAX_BRIEFING_ITEMS, 20);
});

test('batch: only the first 20 successful items get a briefing (detection mode forces full analysis)', async () => {
  const id = await makeBatch(24, { maxCostlyItems: 50 });
  const { calls, batch } = await runBatch(id, new Set([1, 3]));
  assert.equal(enqueued.length, 20);
  const items = batch.items!;
  const withBriefing = items.filter((i) => i.enrichments?.briefing);
  assert.equal(withBriefing.length, 20);
  // Items 1 und 3 scheitern → Items 0,2,4..21 bekommen Briefings, 22/23 nicht.
  assert.deepEqual(
    withBriefing.map((i) => items.indexOf(i)),
    [0, 2, ...Array.from({ length: 18 }, (_, k) => k + 4)],
  );
  assert.equal(items[1].status, 'failed');
  assert.equal(items[22].enrichments?.briefing, undefined);
  assert.equal(items[22].analysisId, undefined, 'beyond the cap detection mode stays detection-only');
  assert.equal(calls.full, 22);
  assert.equal(calls.detection, 2);
  assert.deepEqual(withBriefing[0].enrichments!.briefing, { jobId: withBriefing[0].enrichments!.briefing!.jobId, status: 'queued', overallScore: null });
  assert.equal(enqueued[0].createdBy, 'tester@adobe.com');
  assert.equal(enqueued[0].batchId, id);
  assert.equal(enqueued[0].sections.length, 14);
});

test('batch: respects maxCostlyItems and AI mode; skipped note beyond the cap', async () => {
  const id = await makeBatch(5, { maxCostlyItems: 2, briefingSections: ['s02'] }, true);
  const { calls, batch } = await runBatch(id);
  assert.equal(enqueued.length, 2);
  assert.deepEqual(enqueued[0].sections, ['s02', 's14']);
  assert.equal(calls.full, 5);
  assert.match(batch.items![4].enrichments?.skipped?.briefing ?? '', /Limit of 2/);
});

test('batch: enqueue errors do not fail the item and free the slot', async () => {
  let n = 0;
  bb.setBriefingDeps({
    enqueueBriefing: async (input) => {
      if (n++ === 0) throw new Error('queue down https://internal.example');
      enqueued.push(input);
      return job(nextJobId++, input.analysisId);
    },
  });
  const id = await makeBatch(3, { maxCostlyItems: 2 }, true);
  const { batch } = await runBatch(id);
  const items = batch.items!;
  assert.equal(items[0].status, 'done');
  assert.match(items[0].enrichments?.errors?.briefing ?? '', /could not be queued: queue down \[url\]/);
  assert.equal(enqueued.length, 2);
  assert.ok(items[1].enrichments?.briefing && items[2].enrichments?.briefing);
});

test('batch: no briefing option → nothing enqueued, detection only', async () => {
  const id = await makeBatch(3, { briefing: false });
  const { calls, batch } = await runBatch(id);
  assert.equal(enqueued.length, 0);
  assert.equal(calls.full, 0);
  assert.ok(batch.items!.every((i) => !i.enrichments?.briefing));
});

test('initialEnrichmentState counts existing briefings (restart)', () => {
  const s = initialEnrichmentState([
    { id: 1, url: 'https://a/', status: 'done', enrichments: { briefing: { jobId: 1, status: 'done', overallScore: 70 } } },
    { id: 2, url: 'https://b/', status: 'done' },
  ]);
  assert.equal(s.used.briefing, 1);
});

async function finishedBatch(): Promise<{ id: number; batch: BatchJob }> {
  const id = await makeBatch(3, { maxCostlyItems: 3 }, true);
  const { batch } = await runBatch(id);
  return { id, batch };
}

function stateFor(jobs: Map<number, BriefingJob['status']>, scores: Map<number, number>) {
  return async (analysisId: number): Promise<BriefingStateResponse> => {
    const [jobId, status] = [...jobs.entries()].find(([j]) => enqueuedJobAnalysis.get(j) === analysisId) ?? [];
    if (!jobId || !status) return { job: null, result: null };
    const j = job(jobId, analysisId, status);
    if (status !== 'done') return { job: j, result: null };
    const score = scores.get(jobId) ?? 50;
    return {
      job: j,
      result: {
        executive: { overallScore: score, band: score >= 70 ? 'high' : 'medium', confidence: 'high', verdict: `Verdict ${jobId}`, bullets: [], subScores: [], topPlays: [] },
        generatedAt: '2026-01-01T00:00:00.000Z',
      } as unknown as BriefingStateResponse['result'],
    };
  };
}
const enqueuedJobAnalysis = new Map<number, number>();

test('detail API refreshes briefing summaries; zip export contains reports + scores csv', async () => {
  const { id, batch } = await finishedBatch();
  const items = batch.items!;
  const jobIds = items.map((i) => i.enrichments!.briefing!.jobId);
  items.forEach((i) => enqueuedJobAnalysis.set(i.enrichments!.briefing!.jobId, i.analysisId!));

  // Noch keiner fertig → 404
  let lookups = 0;
  const statuses = new Map<number, BriefingJob['status']>(jobIds.map((j) => [j, 'running']));
  const scores = new Map<number, number>([[jobIds[0], 42], [jobIds[1], 88]]);
  const getLatest = stateFor(statuses, scores);
  bb.setBriefingDeps({
    getLatestBriefingForAnalysis: async (a) => {
      lookups++;
      return getLatest(a);
    },
    getBriefingHtml: async (jobId) => `<html><body>report ${jobId}</body></html>`,
  });
  assert.equal((await fetch(`${base}/api/batches/${id}/briefings.zip`)).status, 404);

  statuses.set(jobIds[0], 'done');
  statuses.set(jobIds[1], 'done');
  statuses.set(jobIds[2], 'error');
  lookups = 0;
  const detail = (await (await fetch(`${base}/api/batches/${id}`)).json()) as BatchJob;
  assert.equal(lookups, 3);
  assert.deepEqual(detail.items![1].enrichments!.briefing, {
    jobId: jobIds[1], status: 'done', overallScore: 88, band: 'high', confidence: 'high', verdict: `Verdict ${jobIds[1]}`, generatedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(detail.items![2].enrichments!.briefing!.status, 'error');

  // Endzustände sind persistiert → kein weiterer Lookup.
  lookups = 0;
  await fetch(`${base}/api/batches/${id}`);
  assert.equal(lookups, 0);

  const res = await fetch(`${base}/api/batches/${id}/briefings.zip`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/zip');
  assert.match(res.headers.get('content-disposition') ?? '', /attachment; filename="briefing-test-client-pre-briefings-\d+\.zip"/);
  const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
  const names = Object.keys(zip.files).sort();
  assert.deepEqual(names, ['brand-0-client-pre-briefing.html', 'brand-1-client-pre-briefing.html', 'briefing-scores.csv']);
  assert.equal(await zip.file('brand-1-client-pre-briefing.html')!.async('string'), `<html><body>report ${jobIds[1]}</body></html>`);
  const csv = (await zip.file('briefing-scores.csv')!.async('string')).replace(/^\uFEFF/, '').trim().split('\r\n');
  assert.equal(csv[0], 'Label,URL,Overall Score,Band,Confidence,Verdict,Status');
  assert.match(csv[1], /^Brand 1,https:\/\/site1\.example\.com\/,88,high,high,Verdict \d+,done$/);
  assert.match(csv[2], /^Brand 0,.*,42,medium,/);
  assert.match(csv[3], /^Brand 2,.*,,,,,error$/);

  assert.equal((await fetch(`${base}/api/batches/999999/briefings.zip`)).status, 404);
});

test('briefingFileName: label or host, deduplicated', () => {
  const used = new Set<string>();
  assert.equal(bb.briefingFileName({ id: 1, url: 'https://www.Example.com/x', label: undefined }, used), 'example.com-client-pre-briefing.html');
  assert.equal(bb.briefingFileName({ id: 2, url: 'https://x/', label: 'Müller & Söhne' }, used), 'muller-sohne-client-pre-briefing.html');
  assert.equal(bb.briefingFileName({ id: 3, url: 'https://x/', label: 'Müller & Söhne' }, used), 'muller-sohne-2-client-pre-briefing.html');
});

test('sources endpoint exposes the briefing limit; create schema validates sections', async () => {
  const s = (await (await fetch(`${base}/api/batches/sources`)).json()) as { maxBriefingItems: number; defaults: { bulk: BatchEnrichmentOptions } };
  assert.equal(s.maxBriefingItems, 20);
  assert.equal(s.defaults.bulk.briefing, false);
  const bad = await fetch(`${base}/api/batches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'account', title: 'x', items: [{ url: 'https://a.example.com' }], enrichments: { briefing: true, briefingSections: ['s99'] } }),
  });
  assert.equal(bad.status, 400);
  assert.match(JSON.stringify(await bad.json()), /briefingSections/);
});

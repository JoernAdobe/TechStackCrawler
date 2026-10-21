import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { after } from 'node:test';
import express from 'express';
import type { AnalysisResult } from '../src/types/analysis.js';
import type { BriefingJob, BriefingStateResponse } from '../src/types/briefing.js';
import { buildBriefingFixture } from './fixtures/briefingFixture.js';

process.env.DB_PATH = ':memory:';
process.env.BRIEFING_POLL_MS = '600000';

const { initDb, getPool, closeDb } = await import('../src/db/index.js');
const { saveAnalysis } = await import('../src/db/analyses.js');
const jobsDb = await import('../src/db/briefingJobs.js');
const queue = await import('../src/services/briefing/queue.js');
const { createBriefingRoutes, briefingFilename } = await import('../src/routes/briefing.js');
const { errorHandler } = await import('../src/utils/http.js');

await initDb();
const db = getPool()!;

let release: (() => void) | null = null;
queue.setBriefingWorkerDeps({
  runPipeline: (input) =>
    new Promise((resolve, reject) => {
      const fx = buildBriefingFixture();
      release = () => resolve({ companyName: fx.companyName, domain: fx.domain, clientDomains: fx.clientDomains, sections: fx.sections, executive: fx.executive, usage: fx.usage });
      input.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }),
  validate: async () => ({ ok: true, errors: [], warnings: [] }),
});

const app = express();
app.use(express.json());
app.use(createBriefingRoutes());
app.use(errorHandler);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

after(async () => {
  queue.stopBriefingWorker();
  await new Promise((r) => setTimeout(r, 50));
  server.close();
  await closeDb();
});

async function newAnalysis(host: string): Promise<number> {
  const result: AnalysisResult = { url: `https://${host}/`, analyzedAt: new Date().toISOString(), summary: '', categories: [], rawDetections: [] };
  return saveAnalysis(db, result);
}

const post = (url: string, body?: unknown) =>
  fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

async function waitStatus(jobId: number, status: string): Promise<void> {
  for (let i = 0; i < 250; i++) {
    if ((await jobsDb.getBriefingJob(db, jobId))?.status === status) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`job ${jobId} never reached ${status}`);
}

test('briefingFilename: kebab-case with fallback', () => {
  assert.equal(briefingFilename('Müller & Söhne GmbH', 3), 'muller-sohne-gmbh-client-pre-briefing.html');
  assert.equal(briefingFilename('', 3), 'briefing-3-client-pre-briefing.html');
});

test('POST validation: 400 for bad body / unknown section, 404 for unknown analysis', async () => {
  const id = await newAnalysis('valid.example');
  assert.equal((await post(`/api/analyses/${id}/briefing`, { sections: 's01' })).status, 400);
  const unknown = await post(`/api/analyses/${id}/briefing`, { sections: ['s01', 's42'] });
  assert.equal(unknown.status, 400);
  assert.match(((await unknown.json()) as { error: string }).error, /s42/);
  assert.equal((await post('/api/analyses/987654/briefing', { sections: ['s01'] })).status, 404);
});

test('full flow: 202 new, 200 existing, state, report.html, download, cancel', async () => {
  const id = await newAnalysis('www.northwind-rockets.example');

  const empty = await fetch(`${base}/api/analyses/${id}/briefing`);
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { job: null, result: null });

  const first = await post(`/api/analyses/${id}/briefing`, { sections: ['s04', 's01'] });
  assert.equal(first.status, 202);
  const job = (await first.json()) as BriefingJob;
  assert.deepEqual(job.sections, ['s01', 's04', 's14']);
  assert.equal(first.headers.get('cache-control'), 'no-store');

  const second = await post(`/api/analyses/${id}/briefing`, { sections: ['s02'] });
  assert.equal(second.status, 200);
  assert.equal(((await second.json()) as BriefingJob).id, job.id);

  await waitStatus(job.id, 'running');
  assert.equal((await fetch(`${base}/api/briefings/${job.id}/report.html`)).status, 404, 'not ready yet');

  release?.();
  await waitStatus(job.id, 'done');

  const state = (await (await fetch(`${base}/api/briefings/${job.id}`)).json()) as BriefingStateResponse;
  assert.equal(state.job?.status, 'done');
  assert.equal(state.result?.companyName, 'Northwind Rockets');
  const latest = (await (await fetch(`${base}/api/analyses/${id}/briefing`)).json()) as BriefingStateResponse;
  assert.equal(latest.job?.id, job.id);

  const view = await fetch(`${base}/api/briefings/${job.id}/report.html`);
  assert.equal(view.status, 200);
  assert.match(view.headers.get('content-type') ?? '', /^text\/html/);
  assert.equal(view.headers.get('content-disposition'), null);
  assert.match(view.headers.get('content-security-policy') ?? '', /default-src 'none'/);
  assert.match(await view.text(), /Client Pre-Briefing powered by Chris Whitehead/);

  const dl = await fetch(`${base}/api/briefings/${job.id}/report.html?download=1`);
  assert.equal(dl.headers.get('content-disposition'), 'attachment; filename="northwind-rockets-client-pre-briefing.html"');

  const cancel = await post(`/api/briefings/${job.id}/cancel`);
  assert.equal(cancel.status, 200);
  assert.equal(((await cancel.json()) as BriefingJob).status, 'done', 'cancel on done job is a no-op');
});

test('cancel a queued/running job and 404s for unknown jobs', async () => {
  const id = await newAnalysis('cancel-me.example');
  const job = (await (await post(`/api/analyses/${id}/briefing`, { sections: [] })).json()) as BriefingJob;
  assert.deepEqual(job.sections, ['s14']);
  const res = await post(`/api/briefings/${job.id}/cancel`);
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as BriefingJob).status, 'cancelled');
  assert.equal((await fetch(`${base}/api/briefings/999999`)).status, 404);
  assert.equal((await post('/api/briefings/999999/cancel')).status, 404);
  assert.equal((await fetch(`${base}/api/briefings/999999/report.html`)).status, 404);
});

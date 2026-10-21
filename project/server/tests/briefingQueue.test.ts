import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import type { BriefingPipelineInput, BriefingPipelineOutput } from '../src/services/briefing/pipeline.js';
import type { BriefingJob, BriefingJobStatus } from '../src/types/briefing.js';
import type { AnalysisResult } from '../src/types/analysis.js';
import { buildBriefingFixture } from './fixtures/briefingFixture.js';

process.env.DB_PATH = ':memory:';
process.env.BRIEFING_POLL_MS = '600000';
process.env.BRIEFING_CONCURRENCY = '2';

const { initDb, getPool, closeDb } = await import('../src/db/index.js');
const { saveAnalysis, getAnalysisById } = await import('../src/db/analyses.js');
const jobsDb = await import('../src/db/briefingJobs.js');
const queue = await import('../src/services/briefing/queue.js');

await initDb();
const db = getPool()!;

function fixtureOutput(): BriefingPipelineOutput {
  const fx = buildBriefingFixture();
  return { companyName: fx.companyName, domain: fx.domain, clientDomains: fx.clientDomains, sections: fx.sections, executive: fx.executive, usage: fx.usage };
}

async function newAnalysis(host: string): Promise<number> {
  const result: AnalysisResult = { url: `https://www.${host}/`, analyzedAt: new Date().toISOString(), summary: '', categories: [], rawDetections: [] };
  return saveAnalysis(db, result);
}

async function waitFor(jobId: number, statuses: BriefingJobStatus[], ms = 5000): Promise<BriefingJob> {
  const end = Date.now() + ms;
  for (;;) {
    const job = await jobsDb.getBriefingJob(db, jobId);
    if (job && statuses.includes(job.status)) return job;
    if (Date.now() > end) throw new Error(`job ${jobId} stuck in ${job?.status}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Pipeline, die bis zum Abbruch blockiert. */
function blockingPipeline(started: number[]) {
  return (input: BriefingPipelineInput) =>
    new Promise<BriefingPipelineOutput>((_resolve, reject) => {
      started.push(input.jobId);
      input.onProgress({ step: input.sections[0], state: 'researching' });
      input.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
}

before(() => queue.setBriefingWorkerDeps({ validate: async () => ({ ok: true, errors: [], warnings: [] }) }));
after(async () => {
  queue.stopBriefingWorker();
  await new Promise((r) => setTimeout(r, 50));
  await closeDb();
});

test('normalizeBriefingSections: dedupe, canonical order, s14 always, unknown rejected', () => {
  assert.deepEqual(queue.normalizeBriefingSections(['s04', 's01', 's04']), ['s01', 's04', 's14']);
  assert.deepEqual(queue.normalizeBriefingSections([]), ['s14']);
  assert.throws(() => queue.normalizeBriefingSections(['s01', 's99']), (e: Error & { status?: number }) => e.status === 400);
});

test('enqueue: missing analysis → 404', async () => {
  await assert.rejects(queue.enqueueBriefing({ analysisId: 99999, sections: ['s01'] }), (e: Error & { status?: number }) => e.status === 404);
});

test('success path stores result, html and enrichment summary (validation issues do not fail the job)', async () => {
  let seen: BriefingPipelineInput | undefined;
  queue.setBriefingWorkerDeps({
    runPipeline: async (input) => {
      seen = input;
      input.onProgress({ step: 's01', state: 'done' });
      return fixtureOutput();
    },
    validate: async () => ({ ok: false, errors: ['s01: demo issue'], warnings: [] }),
  });
  const analysisId = await newAnalysis('northwind-rockets.example');
  const job = await queue.enqueueBriefing({ analysisId, sections: ['s12', 's01', 's09', 's04'], createdBy: 'a@adobe.com' });
  assert.equal(job.status, 'queued');
  assert.deepEqual(job.sections, ['s01', 's04', 's09', 's12', 's14']);
  assert.equal(job.companyName, 'northwind-rockets.example');
  assert.equal(job.createdBy, 'a@adobe.com');

  const done = await waitFor(job.id, ['done', 'error']);
  assert.equal(done.status, 'done', done.error);
  assert.ok(done.startedAt && done.finishedAt);
  assert.deepEqual(seen?.sections, ['s01', 's04', 's09', 's12', 's14']);
  assert.equal(done.companyName, 'Northwind Rockets');
  assert.equal(done.progress.find((p) => p.step === 'render')?.state, 'done');

  const state = await queue.getBriefingState(job.id);
  assert.equal(state.result?.jobId, job.id);
  assert.equal(state.result?.language, 'en');
  assert.equal(state.result?.validation.ok, false);
  assert.equal(state.result?.executive.overallScore, 72);

  const html = await queue.getBriefingHtml(job.id);
  assert.ok(html?.startsWith('<!DOCTYPE html>'));
  assert.ok(html?.includes('Client Pre-Briefing powered by Chris Whitehead'));

  const analysis = await getAnalysisById(db, analysisId);
  assert.deepEqual(analysis?.enrichments?.briefing, {
    jobId: job.id,
    status: 'done',
    overallScore: 72,
    band: 'high',
    confidence: 'medium',
    verdict: state.result?.executive.verdict,
    generatedAt: state.result?.generatedAt,
  });
  assert.equal((await queue.getLatestBriefingForAnalysis(analysisId)).job?.id, job.id);
});

test('error path: user-safe message, summary status error', async () => {
  queue.setBriefingWorkerDeps({
    runPipeline: async () => {
      throw new Error('connect ECONNREFUSED https://internal.example?key=SECRET123');
    },
    validate: async () => ({ ok: true, errors: [], warnings: [] }),
  });
  const analysisId = await newAnalysis('error-co.example');
  const job = await queue.enqueueBriefing({ analysisId, sections: ['s01'] });
  const done = await waitFor(job.id, ['done', 'error']);
  assert.equal(done.status, 'error');
  assert.equal(done.error, 'Briefing generation failed');
  assert.ok(!JSON.stringify(done).includes('SECRET123'));
  assert.equal((await queue.getBriefingState(job.id)).result, null);
  assert.equal(await queue.getBriefingHtml(job.id), null);
  assert.equal((await getAnalysisById(db, analysisId))?.enrichments?.briefing?.status, 'error');
});

test('dedupe, cancel running and cancel queued', async () => {
  const started: number[] = [];
  queue.setBriefingWorkerDeps({ runPipeline: blockingPipeline(started) });
  const a = await newAnalysis('a-co.example');
  const b = await newAnalysis('b-co.example');
  const c = await newAnalysis('c-co.example');

  const jobA = await queue.enqueueBriefing({ analysisId: a, sections: ['s01'] });
  const again = await queue.enqueueBriefing({ analysisId: a, sections: ['s02', 's03'] });
  assert.equal(again.id, jobA.id, 'open job for the same analysis is reused');
  const jobB = await queue.enqueueBriefing({ analysisId: b, sections: ['s01'] });
  await waitFor(jobA.id, ['running']);
  await waitFor(jobB.id, ['running']);
  const jobC = await queue.enqueueBriefing({ analysisId: c, sections: ['s01'] });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((await jobsDb.getBriefingJob(db, jobC.id))?.status, 'queued', 'concurrency limit 2');

  const live = await queue.getBriefingState(jobA.id);
  assert.equal(live.job?.progress[0].state, 'researching', 'live progress visible while running');

  const cancelledC = await queue.cancelBriefing(jobC.id);
  assert.equal(cancelledC.status, 'cancelled');
  assert.equal((await getAnalysisById(db, c))?.enrichments?.briefing?.status, 'cancelled');

  const cancelledA = await queue.cancelBriefing(jobA.id);
  assert.equal(cancelledA.status, 'cancelled');
  await queue.cancelBriefing(jobB.id);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((await jobsDb.getBriefingJob(db, jobA.id))?.status, 'cancelled', 'worker must not overwrite cancel');
  assert.equal((await getAnalysisById(db, a))?.enrichments?.briefing?.status, 'cancelled');
  assert.deepEqual(queue.getBriefingWorkerState().running, []);
  assert.ok(!started.includes(jobC.id));

  const terminal = await queue.cancelBriefing(jobA.id);
  assert.equal(terminal.status, 'cancelled', 'cancel on terminal job is a no-op');
  await assert.rejects(queue.cancelBriefing(424242), (e: Error & { status?: number }) => e.status === 404);
  assert.deepEqual(await queue.getBriefingState(424242), { job: null, result: null });
});

test('restart recovery: running jobs are re-queued and processed', async () => {
  queue.setBriefingWorkerDeps({ runPipeline: async () => fixtureOutput(), validate: async () => ({ ok: true, errors: [], warnings: [] }) });
  const analysisId = await newAnalysis('restart-co.example');
  const id = await jobsDb.insertBriefingJob(db, { analysisId, sections: ['s01', 's14'], progress: [] });
  await db.execute(`UPDATE briefing_jobs SET status = 'running' WHERE id = ?`, [id]);
  assert.equal((await jobsDb.getBriefingJob(db, id))?.status, 'running');
  await queue.startBriefingWorker();
  const done = await waitFor(id, ['done', 'error']);
  assert.equal(done.status, 'done', done.error);
});

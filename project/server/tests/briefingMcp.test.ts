import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { AnalysisResult } from '../src/types/analysis.js';
import type { BriefingJob, BriefingStateResponse } from '../src/types/briefing.js';

process.env.DB_PATH = ':memory:';
process.env.BRIEFING_POLL_MS = '600000';
process.env.PUBLIC_BASE_URL = 'https://techstack.test/';
// Bulk-Batches bleiben in pending_approval → der Runner startet im Test keine echten Scans.
process.env.BATCH_APPROVAL_THRESHOLD = '0';

const { initDb, getPool, closeDb } = await import('../src/db/index.js');
const { saveAnalysis } = await import('../src/db/analyses.js');
const { getBatchHeader } = await import('../src/db/batches.js');
const bb = await import('../src/services/batchBriefing.js');
const { registerParityTools } = await import('../src/mcp/parityTools.js');

await initDb();
const db = getPool()!;

const server = new McpServer({ name: 'test', version: '1.0.0' });
registerParityTools(server);
const client = new Client({ name: 'test-client', version: '1.0.0' });
const [clientT, serverT] = InMemoryTransport.createLinkedPair();
await Promise.all([server.connect(serverT), client.connect(clientT)]);

after(async () => {
  bb.setBriefingDeps(null);
  await client.close();
  await server.close();
  await closeDb();
});

const job = (id: number, analysisId: number, status: BriefingJob['status']): BriefingJob => ({
  id, analysisId, status, sections: ['s01', 's14'], progress: [], createdAt: '2026-01-01T00:00:00.000Z',
});

const doneState = (jobId: number, analysisId: number): BriefingStateResponse => ({
  job: job(jobId, analysisId, 'done'),
  result: {
    executive: {
      overallScore: 77, band: 'high', confidence: 'medium', verdict: 'Strong fit',
      bullets: [{ key: 'whyNow', label: 'Why now', text: 'Replatforming' }],
      subScores: [{ key: 'whitespace', label: 'Whitespace', weight: 0.3, value: 80, kind: 'measured', rationale: 'x', sectionRefs: ['s14'] }],
      topPlays: [{ product: 'AEP', headline: 'Unify data', basedOn: 'stack', sectionRef: 's14' }],
    },
    sections: [{ id: 's01', title: 'Company', eyebrow: '', status: 'done', blocks: [], sources: [], gaps: [] }],
    validation: { ok: true, errors: [], warnings: [] },
  } as unknown as BriefingStateResponse['result'],
});

let enqueued: Array<{ analysisId: number; sections: string[]; createdBy?: string }> = [];
beforeEach(() => {
  enqueued = [];
  bb.setBriefingDeps({
    enqueueBriefing: async (input) => {
      enqueued.push(input);
      return job(7, input.analysisId, 'queued');
    },
    getBriefingState: async (jobId) => (jobId === 7 ? doneState(7, 1) : { job: null, result: null }),
    getLatestBriefingForAnalysis: async (analysisId) =>
      analysisId === 2 ? { job: job(9, 2, 'running'), result: null } : { job: null, result: null },
  });
});

async function call(name: string, args: Record<string, unknown>) {
  const res = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean };
  const text = res.content[0].text;
  return { isError: res.isError === true, text, data: res.isError ? null : JSON.parse(text) };
}

async function newAnalysis(): Promise<number> {
  const r: AnalysisResult = { url: 'https://acme.example/', analyzedAt: new Date().toISOString(), summary: '', categories: [], rawDetections: [] };
  return saveAnalysis(db, r);
}

test('tools are listed with the credit and async hint', async () => {
  const { tools } = await client.listTools();
  for (const name of ['start-client-briefing', 'get-client-briefing']) {
    const t = tools.find((x) => x.name === name);
    assert.ok(t, name);
    assert.match(t.description ?? '', /Client Pre-Briefing powered by Chris Whitehead/);
    assert.match(t.description ?? '', /5–10 minutes/);
  }
  const types = await call('get-assessment-types', {});
  assert.ok(types.data.types.some((t: { type: string }) => t.type === 'client-briefing'));
});

test('start-client-briefing enqueues with normalized sections', async () => {
  const analysisId = await newAnalysis();
  const r = await call('start-client-briefing', { analysisId, sections: ['s03'] });
  assert.equal(r.isError, false);
  assert.deepEqual(enqueued, [{ analysisId, sections: ['s03', 's14'], createdBy: 'mcp' }]);
  assert.equal(r.data.job.id, 7);
  assert.equal(r.data.job.status, 'queued');
  assert.equal(r.data.credit, 'Client Pre-Briefing powered by Chris Whitehead');
  assert.equal(r.data.reportUrl, 'https://techstack.test/api/briefings/7/report.html');
});

test('start-client-briefing errors: unknown analysis, queue failure, invalid section', async () => {
  assert.match((await call('start-client-briefing', { analysisId: 424242 })).text, /not found/);
  const analysisId = await newAnalysis();
  bb.setBriefingDeps({ enqueueBriefing: async () => { throw new Error('queue full'); } });
  const r = await call('start-client-briefing', { analysisId });
  assert.equal(r.isError, true);
  assert.match(r.text, /queue full/);
  const bad = await call('start-client-briefing', { analysisId, sections: ['s99'] });
  assert.equal(bad.isError, true);
});

test('get-client-briefing by jobId returns score/verdict; sections only on request', async () => {
  const r = await call('get-client-briefing', { jobId: 7 });
  assert.equal(r.isError, false);
  assert.equal(r.data.job.status, 'done');
  assert.equal(r.data.overallScore, 77);
  assert.equal(r.data.band, 'high');
  assert.equal(r.data.confidence, 'medium');
  assert.equal(r.data.verdict, 'Strong fit');
  assert.equal(r.data.bullets.length, 1);
  assert.equal(r.data.subScores.length, 1);
  assert.equal(r.data.topPlays[0].product, 'AEP');
  assert.equal(r.data.reportUrl, 'https://techstack.test/api/briefings/7/report.html');
  assert.equal(r.data.sections, undefined);
  const full = await call('get-client-briefing', { jobId: 7, includeSections: true });
  assert.equal(full.data.sections.length, 1);
});

test('get-client-briefing by analysisId while running; errors when missing', async () => {
  const r = await call('get-client-briefing', { analysisId: 2 });
  assert.equal(r.data.job.status, 'running');
  assert.equal(r.data.overallScore, null);
  assert.equal(r.data.reportUrl, null);
  assert.match(r.data.hint, /poll get-client-briefing/);
  assert.equal((await call('get-client-briefing', {})).isError, true);
  assert.match((await call('get-client-briefing', { jobId: 5 })).text, /not found/);
  assert.match((await call('get-client-briefing', { analysisId: 3 })).text, /start-client-briefing/);
});

test('create-assessment passes the briefing option through', async () => {
  const r = await call('create-assessment', {
    kind: 'bulk',
    title: 'MCP briefing',
    urls: [{ url: 'https://a.example.com' }],
    briefing: true,
    briefingSections: ['s05'],
  });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.data.status, 'pending_approval');
  const header = await getBatchHeader(db, r.data.id);
  assert.equal(header?.enrichmentOptions?.briefing, true);
  assert.deepEqual(header?.enrichmentOptions?.briefingSections, ['s05', 's14']);
  assert.equal(header?.enrichmentOptions?.maxCostlyItems, 20);
});

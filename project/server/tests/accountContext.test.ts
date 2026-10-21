import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCOUNT_CONTEXT_MAX_CHARS, buildAccountContext } from '../src/services/accountContext.js';
import { requireIntegrationToken } from '../src/routes/integration.js';
import type { AnalysisResult } from '../src/types/analysis.js';

const analysis: AnalysisResult = {
  url: 'https://www.bmw.com/',
  analyzedAt: '2026-10-15T07:02:02Z',
  summary: 'BMW runs  a fragmented   martech stack.',
  categories: [
    { category: 'Analytics', currentTechnology: 'Adobe Analytics', challengesAndPainPoints: 'AppMeasurement legacy', adobeOpportunity: 'CJA' },
    { category: 'CMS', currentTechnology: '', challengesAndPainPoints: '', adobeOpportunity: '' },
  ],
  rawDetections: [
    { name: 'Adobe Analytics', categories: ['Analytics'], confidence: 100 },
    { name: 'jQuery', version: '3.6', categories: ['JS'], confidence: 90 },
    { name: 'WeakThing', categories: ['X'], confidence: 10, weak: true },
  ],
  useCaseDiscovery: {
    summary: '',
    useCases: [{ rank: 1, title: 'Unified profile', description: 'Join data.', adobeProducts: ['RTCDP'], businessValue: 'More revenue.' }],
  },
};

test('buildAccountContext enthält Stack, Technologien und Use Cases, ohne leere/schwache Einträge', () => {
  const ctx = buildAccountContext({ name: 'BMW Group', domain: 'bmw.com', analysis });
  assert.match(ctx, /^# BMW Group – Account context from TechStack Analyzer/);
  assert.match(ctx, /Analyzed: 2026-10-15/);
  assert.match(ctx, /BMW runs a fragmented martech stack\./);
  assert.match(ctx, /\*\*Analytics:\*\* Adobe Analytics \(challenges: AppMeasurement legacy; Adobe opportunity: CJA\)/);
  assert.doesNotMatch(ctx, /\*\*CMS:\*\*/);
  assert.match(ctx, /Adobe Analytics, jQuery 3\.6/);
  assert.doesNotMatch(ctx, /WeakThing/);
  assert.match(ctx, /1\. \*\*Unified profile\*\* \(RTCDP\)/);
  assert.doesNotMatch(ctx, /Pre-Briefing/);
});

test('buildAccountContext kappt auf die Maximallänge', () => {
  const big = { ...analysis, summary: 'x'.repeat(ACCOUNT_CONTEXT_MAX_CHARS * 2) };
  assert.equal(buildAccountContext({ name: 'A', domain: 'a.de', analysis: big }).length, ACCOUNT_CONTEXT_MAX_CHARS);
});

function run(token: string | undefined, header: string | undefined) {
  const prev = process.env.INTEGRATION_TOKEN;
  if (token === undefined) delete process.env.INTEGRATION_TOKEN;
  else process.env.INTEGRATION_TOKEN = token;
  let status = 200;
  let nextCalled = false;
  const req = { header: () => header } as never;
  const res = { status: (s: number) => ((status = s), res), json: () => res } as never;
  requireIntegrationToken(req, res, () => (nextCalled = true));
  if (prev === undefined) delete process.env.INTEGRATION_TOKEN;
  else process.env.INTEGRATION_TOKEN = prev;
  return { status, nextCalled };
}

test('requireIntegrationToken: deaktiviert ohne Secret, 401 bei falschem, next bei richtigem Token', () => {
  assert.deepEqual(run(undefined, 'abc'), { status: 503, nextCalled: false });
  assert.deepEqual(run('secret', undefined), { status: 401, nextCalled: false });
  assert.deepEqual(run('secret', 'wrong'), { status: 401, nextCalled: false });
  assert.deepEqual(run('secret', 'secret'), { status: 200, nextCalled: true });
});

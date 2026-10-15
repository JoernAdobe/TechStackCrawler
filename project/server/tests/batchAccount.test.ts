import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAccountView, trafficScore } from '../src/services/accountView.js';
import { aggregateFindings } from '../src/services/accountFindings.js';
import {
  createEnrichmentState,
  createThrottle,
  friendlySourceError,
  resolveEnrichmentOptions,
  runItemEnrichments,
  type EnrichmentDeps,
} from '../src/services/batchEnrichment.js';
import { compactLighthouse, compactTraffic } from '../src/services/batchEnrichmentCompact.js';
import { compactDetections, initialEnrichmentState } from '../src/services/batchRunner.js';
import { PRE_CONSENT_WARNING } from '../src/services/consentAudit.js';
import { accountTables, batchToMarkdown } from '../src/services/accountExport.js';
import { batchToCsv } from '../src/services/batchExport.js';
import type { BatchItem, BatchJob, LighthouseResult, TrafficResult, ObservePointResult } from '../src/types/parity.js';
import type { BatchEnrichmentOptions } from '../src/types/batchAccount.js';

const det = (name: string, categories: string[], extra: Partial<NonNullable<BatchItem['detections']>[number]> = {}) => ({
  name,
  categories,
  confidence: 90,
  ...extra,
});

function item(id: number, url: string, detections: NonNullable<BatchItem['detections']>, enrichments: BatchItem['enrichments'] = {}): BatchItem {
  return { id, url, status: 'done', detections, enrichments };
}

const ITEMS: BatchItem[] = [
  item(
    1,
    'https://www.brand-a.com/',
    [det('Adobe Analytics', ['Analytics']), det('Adobe Experience Manager', ['CMS']), det('Google Tag Manager', ['Tag Management'])],
    {
      traffic: { sources: ['tranco'], trancoRank: 1000 },
      lighthouse: { mobilePerformance: 35, desktopPerformance: 80, accessibility: 90, seo: 95, bestPractices: 90, lcpMs: 5200, cls: 0.05 },
      observepoint: {
        status: 'done', tagCount: 12, agreementRate: 80, confirmed: 8, techstackOnly: 1, observepointOnly: 1, conflicts: ['Tag Management'],
        findings: [{ id: 'non-eu', title: 'Requests to non-EU hosts', type: 'privacy', severity: 'high' }],
      },
    },
  ),
  item(
    2,
    'https://brand-b.de/',
    [det('Google Analytics', ['Analytics']), det('Sitecore', ['CMS']), det('Google Tag Manager', ['Tag Management']), det('Hotjar', ['Analytics'], { preConsent: true })],
    {
      traffic: { sources: ['tranco'], trancoRank: 100000 },
      scanWarnings: [{ code: 'few_detections', severity: 'info', message: 'Only 3 technologies were detected.' }],
    },
  ),
  item(3, 'https://brand-c.fr/', [det('Matomo', ['Analytics']), det('WordPress', ['CMS']), det('Facebook Pixel', ['Advertising'], { weak: true })]),
  { id: 4, url: 'https://broken.example/', status: 'failed', error: 'Timeout', enrichments: { errors: { traffic: 'traffic: no response in time' } } },
];

test('trafficScore: Tranco rank and Semrush visits map to 0–100', () => {
  assert.equal(trafficScore(undefined), null);
  assert.equal(trafficScore({ sources: [] }), null);
  assert.equal(trafficScore({ sources: ['tranco'], trancoRank: 1 }), 100);
  assert.equal(trafficScore({ sources: ['tranco'], trancoRank: 1000 }), 50);
  assert.equal(trafficScore({ sources: ['tranco'], trancoRank: 1_000_000 }), 0);
  assert.equal(trafficScore({ sources: ['semrush'], visits: 1_000_000_000 }), 100);
  // Maximum aus beiden Signalen
  assert.equal(trafficScore({ sources: ['tranco', 'semrush'], trancoRank: 1_000_000, visits: 1_000_000 }), 50);
});

test('buildAccountView: domains, tech matrix, fragmentation and footprint', () => {
  const view = buildAccountView(ITEMS, new Date('2026-01-01T00:00:00Z'));
  assert.ok(view);
  assert.deepEqual(view.domains.map((d) => d.host), ['brand-a.com', 'brand-b.de', 'brand-c.fr']);
  assert.equal(view.domains[0].trafficScore, 50);
  assert.equal(view.domains[2].trafficScore, null);
  assert.equal(view.domains[0].adobeCount, 2);

  const gtm = view.techMatrix.find((t) => t.technology === 'Google Tag Manager');
  assert.deepEqual(gtm?.presence, [true, true, false]);
  assert.equal(gtm?.count, 2);
  assert.ok(!view.techMatrix.some((t) => t.technology === 'Facebook Pixel'), 'weak detections excluded');

  const analytics = view.fragmentation.find((f) => f.buildingBlock === 'Analytics');
  assert.equal(analytics?.solutions.length, 4); // Adobe Analytics, GA, Hotjar, Matomo
  const fp = view.footprint.find((f) => f.buildingBlock === 'Analytics');
  assert.equal(fp?.status, 'mixed');
  assert.equal(fp?.adobeDomains, 1);
  assert.equal(fp?.competitorDomains, 2);
  assert.equal(view.footprint.find((f) => f.buildingBlock === 'CDP')?.status, 'none');
});

test('buildAccountView: rankings, coverage and source issues', () => {
  const view = buildAccountView(ITEMS)!;
  assert.deepEqual(view.trafficRanking.map((t) => t.host), ['brand-a.com', 'brand-b.de']);
  assert.equal(view.performanceRanking.length, 1);
  assert.equal(view.performanceRanking[0].mobile, 35);
  assert.equal(view.observepoint[0].agreementRate, 80);
  assert.equal(view.coverage.traffic, 2);
  assert.equal(view.coverage.lighthouse, 1);
  assert.equal(view.coverage.geo, 0);
  assert.deepEqual(view.sourceIssues, [{ source: 'traffic', errors: 1, skipped: 0, sample: 'traffic: no response in time' }]);
  assert.equal(buildAccountView([ITEMS[3]]), null);
});

test('buildAccountView: opportunities prioritised by traffic × gap', () => {
  const view = buildAccountView(ITEMS)!;
  const cms = view.opportunities.find((o) => o.buildingBlock === 'CMS');
  assert.ok(cms);
  assert.equal(cms.gap, 'fragmented'); // Sitecore + WordPress
  assert.deepEqual(cms.domains.sort(), ['brand-b.de', 'brand-c.fr']);
  assert.ok(!cms.domains.includes('brand-a.com'), 'AEM domain is not a gap');
  // Tag Management: GTM überall außer brand-c (dort "none detected")
  const tms = view.opportunities.find((o) => o.buildingBlock === 'Tag Management');
  assert.equal(tms?.gap, 'competitor');
  // sortiert absteigend
  const scores = view.opportunities.map((o) => o.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
});

test('aggregateFindings: OP, pre-consent, scan warnings, lighthouse thresholds', () => {
  const findings = aggregateFindings(ITEMS.slice(0, 3), ['a', 'b', 'c']);
  const keys = findings.map((f) => f.key);
  assert.ok(keys.includes('op:non-eu'));
  assert.ok(keys.includes('preconsent:Hotjar'));
  assert.ok(keys.includes('scan:few_detections'));
  assert.ok(keys.includes('lh:mobile-perf'));
  assert.ok(keys.includes('lh:lcp'));
  assert.ok(keys.includes('conflict:Tag Management'));
  assert.equal(findings[0].severity, 'high');
});

test('compactDetections keeps the pre-consent flag', () => {
  const out = compactDetections([
    { name: 'Hotjar', categories: ['Analytics'], confidence: 90, evidence: [PRE_CONSENT_WARNING, 'script'] },
    { name: 'GTM', categories: ['Tag Management'], confidence: 90, evidence: ['x'] },
  ]);
  assert.equal(out[0].preConsent, true);
  assert.equal(out[1].preConsent, undefined);
});

test('resolveEnrichmentOptions: cheap sources on, costly off, clamps budget', () => {
  const acc = resolveEnrichmentOptions('account', true);
  assert.equal(acc.traffic, true);
  assert.equal(acc.observepoint, true);
  assert.equal(acc.mobileApps, true);
  assert.equal(acc.lighthouse, false);
  assert.equal(acc.semrush, false);
  assert.equal(acc.geo, false);
  assert.equal(acc.useCases, false);
  const bulk = resolveEnrichmentOptions('bulk', false, { useCases: true, maxCostlyItems: 999 });
  assert.equal(bulk.mobileApps, false);
  assert.equal(bulk.useCases, false, 'use cases need AI analysis');
  assert.equal(bulk.maxCostlyItems, 50);
});

test('initialEnrichmentState restores used budget after restart', () => {
  const state = initialEnrichmentState([
    item(1, 'https://a/', [], { lighthouse: { mobilePerformance: 50, desktopPerformance: 60, accessibility: null, seo: null, bestPractices: null } }),
    item(2, 'https://b/', [], { errors: { lighthouse: 'x' }, traffic: { sources: ['semrush'], visits: 10 } }),
  ]);
  assert.equal(state.used.lighthouse, 2);
  assert.equal(state.used.semrush, 1);
});

// ── Orchestrierung mit gemockten Quellen ────────────────────────────────────
const traffic = (domain: string, extra: Partial<TrafficResult> = {}): TrafficResult => ({
  domain, fetchedAt: 'now', sources: ['tranco'], trancoRank: 500, ...extra,
});
const lh = (perf: number | null, error?: string): LighthouseResult => ({
  url: 'u', fetchedAt: 'now', source: 'pagespeed-insights',
  ...(perf !== null ? { mobile: { scores: { performance: perf, accessibility: 90, seo: 90, bestPractices: 90 }, vitals: { lcpMs: 3000 } } } : {}),
  ...(error ? { error } : {}),
} as LighthouseResult);

function mockDeps(overrides: Partial<EnrichmentDeps> = {}) {
  const calls: Record<string, number> = {};
  const count = (k: string) => { calls[k] = (calls[k] ?? 0) + 1; };
  const deps: EnrichmentDeps = {
    getTraffic: async (url, opts) => { count(opts.semrush ? 'semrush' : 'traffic'); return traffic(url); },
    runLighthouse: async () => { count('lighthouse'); return lh(70); },
    observePointConfigured: () => true,
    semrushConfigured: () => false,
    getObservePoint: async (url) => {
      count('observepoint');
      return { url, domain: url, fetchedAt: 'now', status: 'not_found', reused: true, tags: [] } as ObservePointResult;
    },
    getOpCoverage: async () => new Set<string>(),
    findMobileApps: async () => { count('mobileApps'); return { fetchedAt: 'now', apps: [] }; },
    runGeoScore: async () => { count('geo'); throw new Error('Bedrock unavailable'); },
    discoverUseCases: async () => { count('useCases'); return { result: { useCases: [] } as never, sitemapUrls: [] }; },
    throttle: async () => {},
    timeoutMs: () => 1000,
    ...overrides,
  };
  return { deps, calls };
}

const opts = (o: Partial<BatchEnrichmentOptions>) => resolveEnrichmentOptions('bulk', false, o);
const input = (url: string) => ({ url, detections: [] });

test('runItemEnrichments: runs selected sources, isolates errors per source', async () => {
  const { deps, calls } = mockDeps();
  const state = createEnrichmentState();
  const out = await runItemEnrichments(input('https://a.com/'), opts({ geo: true, mobileApps: true }), state, deps);
  assert.equal(out.compact.traffic?.trancoRank, 500);
  assert.equal(out.compact.observepoint?.status, 'not_found');
  assert.ok(out.compact.mobileApps);
  assert.equal(out.compact.geo, undefined);
  assert.match(out.compact.errors?.geo ?? '', /Bedrock unavailable/);
  assert.equal(calls.lighthouse, undefined, 'lighthouse off by default');
  assert.ok(out.full.traffic);
});

test('runItemEnrichments: costly budget, PSI quota circuit breaker, semrush without key', async () => {
  let n = 0;
  const { deps, calls } = mockDeps({
    runLighthouse: async () => {
      n++;
      return n === 1 ? lh(60) : lh(null, 'PageSpeed Insights quota exhausted (no API key configured).');
    },
  });
  const state = createEnrichmentState();
  const o = opts({ lighthouse: true, semrush: true, maxCostlyItems: 5, observepoint: false });
  const r1 = await runItemEnrichments(input('https://a.com/'), o, state, deps);
  assert.equal(r1.compact.lighthouse?.mobilePerformance, 60);
  assert.equal(r1.compact.skipped?.semrush, 'SEMRUSH_API_KEY not configured');
  assert.equal(calls.semrush, undefined);
  const r2 = await runItemEnrichments(input('https://b.com/'), o, state, deps);
  assert.match(r2.compact.errors?.lighthouse ?? '', /quota/);
  const r3 = await runItemEnrichments(input('https://c.com/'), o, state, deps);
  assert.match(r3.compact.skipped?.lighthouse ?? '', /quota/);
  assert.equal(n, 2, 'no PSI call after quota');

  const budgetState = createEnrichmentState();
  const b = opts({ lighthouse: true, maxCostlyItems: 1, observepoint: false, traffic: false });
  const { deps: d2 } = mockDeps();
  await runItemEnrichments(input('https://a.com/'), b, budgetState, d2);
  const over = await runItemEnrichments(input('https://b.com/'), b, budgetState, d2);
  assert.match(over.compact.skipped?.lighthouse ?? '', /Limit of 1/);
});

test('runItemEnrichments: timeouts, OP not configured, use cases require AI analysis', async () => {
  const { deps } = mockDeps({
    observePointConfigured: () => false,
    getTraffic: () => new Promise(() => {}),
    timeoutMs: () => 20,
  });
  const out = await runItemEnrichments(
    input('https://a.com/'),
    resolveEnrichmentOptions('account', true, { useCases: true }),
    createEnrichmentState(),
    deps,
  );
  assert.equal(out.compact.errors?.traffic, 'traffic: no response in time');
  assert.equal(out.compact.skipped?.observepoint, 'ObservePoint is not configured');
  assert.equal(out.compact.skipped?.useCases, 'Requires full AI analysis');
});

test('friendlySourceError strips URLs and keys', () => {
  const msg = friendlySourceError('semrush', new Error('failed https://api.semrush.com/?key=SECRET123 key=SECRET123'));
  assert.ok(!msg.includes('SECRET123'));
  assert.equal(friendlySourceError('lighthouse', new Error('HTTP 429')), 'lighthouse: rate-limited – try again later');
});

test('createThrottle enforces a minimum interval', async () => {
  const t = createThrottle(30);
  const start = Date.now();
  await Promise.all([t(), t(), t()]);
  assert.ok(Date.now() - start >= 55);
});

test('compact mappers keep only small fields', () => {
  const c = compactTraffic(traffic('a.com', { sources: ['tranco', 'semrush'], semrush: { visits: 1234, topCountries: [{ country: 'DE', sharePct: 50 }] } }));
  assert.deepEqual(c, { sources: ['tranco', 'semrush'], trancoRank: 500, visits: 1234, topCountry: 'DE' });
  assert.equal(compactLighthouse(lh(null, 'err')), undefined);
});

test('exports: CSV and Markdown include account sections, empty sources hidden', () => {
  const view = buildAccountView(ITEMS)!;
  const names = accountTables(view).map((t) => t.name);
  assert.ok(names.includes('Top Account Opportunities'));
  assert.ok(names.includes('Tech Matrix'));
  assert.ok(!names.includes('GEO Score'), 'no GEO data → section hidden');
  const batch: BatchJob = {
    id: 7, kind: 'account', title: 'Brand | Test', aiAnalysis: false, status: 'completed', createdAt: '', updatedAt: '',
    total: 4, done: 3, failed: 1, items: ITEMS, accountView: view,
  };
  const csv = batchToCsv(batch);
  assert.ok(csv.includes('Top Account Opportunities'));
  assert.ok(csv.includes('Privacy & Technical Findings'));
  const md = batchToMarkdown(batch);
  assert.ok(md.startsWith('# Brand | Test'));
  assert.ok(md.includes('## Adobe Footprint vs. Competition'));
  assert.ok(md.includes('| Domain | Label | Traffic score'));
  assert.ok(md.includes('## Source notes'));
});

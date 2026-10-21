import assert from 'node:assert/strict';
import test from 'node:test';
import { matchUsageEvent } from '../src/services/usageTracking.js';
import { aggregateUsage, weekKey } from '../src/services/usageStats.js';
import { buildAnalysisReportHtml, renderAnalysisSections } from '../src/services/analysisReport.js';
import type { UsageEventRow } from '../src/db/usageEvents.js';
import type { AnalysisResult } from '../src/types/analysis.js';

test('matchUsageEvent maps tracked routes and extracts the analysis id', () => {
  assert.deepEqual(matchUsageEvent('GET', '/api/analyses/42/report.pdf'), { event: 'export_pdf', analysisId: 42 });
  assert.deepEqual(matchUsageEvent('POST', '/api/analyses/7/briefing'), { event: 'briefing', analysisId: 7 });
  assert.equal(matchUsageEvent('GET', '/'), null); // visits come from the client beacon
  assert.equal(matchUsageEvent('GET', '/api/dashboard/stats'), null);
  assert.equal(matchUsageEvent('GET', '/api/analyses/7/use-cases/status'), null);
});

test('weekKey uses ISO weeks', () => {
  assert.equal(weekKey(Date.UTC(2026, 0, 1)), '2026-W01');
  assert.equal(weekKey(Date.UTC(2025, 11, 29)), '2026-W01');
});

test('aggregateUsage computes users, return/usage rates and excludes the admin', () => {
  const now = Date.UTC(2026, 9, 15, 12);
  const day = 86_400_000;
  const ev = (ts: number, visitor: string, event: string, extra: Partial<UsageEventRow> = {}): UsageEventRow => ({
    ts_ms: ts, visitor_id: visitor, email: null, event, analysis_id: null, status: 200, ...extra,
  });
  const events = [
    ev(now - 10 * day, 'a', 'visit'),
    ev(now - 10 * day + 1, 'a', 'analysis'),
    ev(now - 2 * day, 'a', 'visit'),
    ev(now - 2 * day + 1, 'a', 'export_pdf', { analysis_id: 5 }),
    ev(now - 3 * day, 'b', 'visit'),
    ev(now - 1000, 'admin', 'visit'),
    ev(now - 900, 'admin', 'briefing', { email: 'Boss@adobe.com' }),
    ev(now - 1000, 'integration', 'rfp_context'),
    ev(now - 1000, 'd', 'analysis', { status: 500 }),
  ];
  const r = aggregateUsage(events, now, ['boss@adobe.com']);
  assert.equal(r.users.total, 2); // a + b, admin excluded
  assert.equal(r.users.visits, 3);
  assert.equal(r.users.returning, 1);
  assert.equal(r.users.returnRate, 50);
  assert.equal(r.users.usageRate, 67); // 2 of 3 visits had an action
  assert.equal(r.users.wau, 2);
  assert.equal(r.users.weeklyRetention, 100); // a active in prev week and this week
  assert.equal(r.users.avgVisitsPerUser, 1.5);
  assert.equal(r.exports.total, 1);
  assert.equal(r.integrations.rfpContext, 1);
  assert.ok(r.exportedAnalysisIds.has(5));
  assert.equal(r.featureUsage.find((f) => f.name === 'briefing'), undefined);
  assert.equal(r.topUsers[0].label, 'User a');
});

const analysis: AnalysisResult = {
  id: 1,
  url: 'https://www.example.com',
  analyzedAt: '2026-10-01T00:00:00Z',
  summary: 'Summary <b>',
  categories: [
    { category: 'CMS', currentTechnology: 'WordPress', challengesAndPainPoints: 'Scale', adobeOpportunity: 'AEM Sites' },
    { category: 'Analytics', currentTechnology: 'Not detected', challengesAndPainPoints: '-', adobeOpportunity: 'n/a' },
  ],
  rawDetections: [],
};

test('renderAnalysisSections escapes content and skips undetected rows', () => {
  const html = renderAnalysisSections(analysis);
  assert.ok(html.includes('Summary &lt;b&gt;'));
  assert.ok(html.includes('AEM Sites'));
  assert.ok(!html.includes('Not detected'));
});

test('buildAnalysisReportHtml appends to a briefing before the footer or stands alone', () => {
  const merged = buildAnalysisReportHtml(analysis, '<html><body><div class="container">B\n  <footer>F</footer></div></body></html>');
  assert.ok(merged.indexOf('Current Technology Stack') < merged.indexOf('<footer>'));
  const alone = buildAnalysisReportHtml(analysis, null);
  assert.ok(alone.startsWith('<!DOCTYPE html>'));
  assert.ok(alone.includes('example.com'));
});

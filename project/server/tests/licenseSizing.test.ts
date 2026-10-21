import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compact,
  defaultAssumptions,
  estimateLicenses,
  pageViewsPerMonth,
  sizingBasis,
} from '../../client/src/lib/licenseSizing.ts';
import type { AnalysisResult } from '../../client/src/types/analysis.ts';

function analysis(semrush?: Record<string, unknown>, apps = 0): AnalysisResult {
  return {
    url: 'https://www.example.com/',
    analyzedAt: '2026-05-01T00:00:00Z',
    summary: '',
    categories: [],
    rawDetections: [
      { name: 'Google Analytics', categories: ['Analytics'], confidence: 100 },
      { name: 'Adobe Experience Manager', categories: ['CMS'], confidence: 100 },
      { name: 'Shopify', categories: ['eCommerce'], confidence: 100, weak: true },
    ],
    enrichments: {
      traffic: { domain: 'example.com', fetchedAt: '', sources: ['semrush'], semrush: semrush ? { topCountries: [], topPages: [], ...semrush } : undefined },
      mobileApps: { fetchedAt: '', apps: Array.from({ length: apps }, () => ({ store: 'apple', appId: 'x', name: 'App', storeUrl: '' })) },
    },
  } as unknown as AnalysisResult;
}

const byKey = (a: AnalysisResult) => {
  const assumptions = defaultAssumptions(sizingBasis(a));
  return { assumptions, map: Object.fromEntries(estimateLicenses(a, assumptions).map((e) => [e.key, e])) };
};

test('traffic metrics follow the product description definitions', () => {
  const { assumptions, map } = byKey(analysis({ visits: 1_000_000, pagesPerVisit: 4, uniqueVisitors: 500_000 }));
  assert.equal(pageViewsPerMonth(assumptions), 4_000_000);
  // Analytics: 4M PV × 1.5 events × 12
  assert.equal(map.analytics.mid, 72_000_000);
  assert.equal(map.target.mid, 48_000_000);
  assert.equal(map.aemSites.mid, 4_000_000);
  // CJA: 72M × 13/12 × 1.2
  assert.equal(map.cja.mid, 93_600_000);
  assert.equal(map.cja.licenseUnits, 94);
  assert.ok(map.analytics.low < map.analytics.mid && map.analytics.mid < map.analytics.high);
});

test('profile metrics derive from known customers and visitors', () => {
  const { assumptions, map } = byKey(analysis({ visits: 1_000_000, pagesPerVisit: 4, uniqueVisitors: 500_000 }));
  assert.equal(assumptions.knownCustomers, 600_000);
  assert.equal(map.rtcdp.mid, 1_100_000);
  assert.equal(map.rtcdp.licenseUnits, 1100);
  assert.equal(map.ajo.mid, 360_000);
  assert.equal(map.rtcdp.confidence, 'low');
});

test('edited assumptions recalculate and five API calls count as one content request', () => {
  const a = analysis({ visits: 1_000_000, pagesPerVisit: 4, uniqueVisitors: 500_000 });
  const assumptions = { ...defaultAssumptions(sizingBasis(a)), apiCallsPerPageView: 5, knownCustomers: 2_000_000 };
  const map = Object.fromEntries(estimateLicenses(a, assumptions).map((e) => [e.key, e]));
  assert.equal(map.aemSites.mid, 8_000_000);
  assert.equal(map.ajo.mid, 1_200_000);
});

test('app traffic and missing semrush fields fall back sensibly', () => {
  const withApps = defaultAssumptions(sizingBasis(analysis({ visits: 100_000 }, 2)));
  assert.equal(withApps.appTrafficPct, 30);
  assert.equal(withApps.pagesPerVisit, 3);
  assert.equal(withApps.monthlyUniqueVisitors, 60_000);
  const none = sizingBasis(analysis());
  assert.equal(none.source, 'manual');
  assert.equal(defaultAssumptions(none).monthlyVisits, 0);
});

test('detected tools are shown per category, weak detections ignored', () => {
  const { map } = byKey(analysis({ visits: 1000 }));
  assert.deepEqual(map.analytics.detected, ['Google Analytics']);
  assert.equal(map.aemSites.adobeInUse, true);
  assert.deepEqual(map.commerce.detected, []);
});

test('compact formats large numbers', () => {
  assert.equal(compact(72_000_000), '72M');
  assert.equal(compact(1_250_000_000), '1.25B');
  assert.equal(compact(93_600), '93.6K');
});

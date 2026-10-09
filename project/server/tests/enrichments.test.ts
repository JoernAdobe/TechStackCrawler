import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPsiUrl, parsePsiResponse } from '../src/services/lighthouse.js';
import {
  defaultDisplayDate,
  normalizeDomain,
  parseSemrushCsv,
  parseSemrushGeo,
  parseSemrushSummary,
  parseSemrushTopPages,
  parseTrancoRanks,
} from '../src/services/traffic.js';
import { brandFromUrl, extractAppLinks, mapItunesApp, matchesBrand } from '../src/services/mobileApps.js';

const psiFixture = {
  lighthouseResult: {
    categories: {
      performance: { score: 0.537 },
      accessibility: { score: 0.91 },
      'best-practices': { score: null },
      seo: { score: 1 },
    },
    audits: {
      'largest-contentful-paint': { numericValue: 4211.6 },
      'cumulative-layout-shift': { numericValue: 0.12345 },
      'first-contentful-paint': { numericValue: 1800.2 },
      'total-blocking-time': { numericValue: 350.4 },
      'render-blocking-resources': {
        id: 'render-blocking-resources',
        title: 'Eliminate render-blocking resources',
        details: { type: 'opportunity', overallSavingsMs: 820 },
      },
      'unused-javascript': {
        id: 'unused-javascript',
        title: 'Reduce unused JavaScript',
        details: { type: 'opportunity', overallSavingsMs: 1500.7 },
      },
      'modern-image-formats': {
        id: 'modern-image-formats',
        title: 'Serve images in next-gen formats',
        details: { type: 'opportunity', overallSavingsMs: 0 },
      },
      'final-screenshot': { id: 'final-screenshot', title: 'Screenshot', details: { type: 'screenshot' } },
    },
  },
  loadingExperience: {
    overall_category: 'AVERAGE',
    metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 240, category: 'AVERAGE' } },
  },
};

test('parsePsiResponse: scores, vitals and sorted opportunities', () => {
  const r = parsePsiResponse(psiFixture);
  assert.deepEqual(r.scores, { performance: 54, accessibility: 91, bestPractices: null, seo: 100 });
  assert.deepEqual(r.vitals, {
    lcpMs: 4212,
    cls: 0.123,
    fcpMs: 1800,
    tbtMs: 350,
    inpMs: 240,
    fieldCategory: 'AVERAGE',
  });
  assert.deepEqual(r.opportunities, [
    { id: 'unused-javascript', title: 'Reduce unused JavaScript', savingsMs: 1501 },
    { id: 'render-blocking-resources', title: 'Eliminate render-blocking resources', savingsMs: 820 },
  ]);
});

test('parsePsiResponse: limits to 5 opportunities and throws on error payloads', () => {
  const audits: Record<string, unknown> = {};
  for (let i = 1; i <= 8; i++) {
    audits[`a${i}`] = { id: `a${i}`, title: `A${i}`, details: { type: 'opportunity', overallSavingsMs: i * 100 } };
  }
  const r = parsePsiResponse({ lighthouseResult: { categories: {}, audits } });
  assert.equal(r.opportunities.length, 5);
  assert.equal(r.opportunities[0].id, 'a8');
  assert.deepEqual(r.vitals, {});
  assert.throws(() => parsePsiResponse({ error: { code: 429, message: 'Quota exceeded' } }), /Quota exceeded/);
  assert.throws(() => parsePsiResponse({}), /lighthouseResult/);
});

test('buildPsiUrl: strategy, all four categories, optional key', () => {
  const u = new URL(buildPsiUrl('https://example.com/', 'desktop'));
  assert.equal(u.searchParams.get('strategy'), 'desktop');
  assert.deepEqual(u.searchParams.getAll('category'), ['performance', 'accessibility', 'best-practices', 'seo']);
  assert.equal(u.searchParams.has('key'), false);
  assert.equal(new URL(buildPsiUrl('https://example.com/', 'mobile', 'k')).searchParams.get('key'), 'k');
});

test('normalizeDomain strips protocol, path, port and www', () => {
  assert.equal(normalizeDomain('https://www.Example.de:8443/foo?x=1'), 'example.de');
  assert.equal(normalizeDomain('shop.example.com/path'), 'shop.example.com');
  assert.equal(normalizeDomain('www.otto.de'), 'otto.de');
});

test('Semrush summary parser (CSV, decimal bounce rate)', () => {
  const rows = parseSemrushCsv(
    'target;display_date;visits;desktop_visits;mobile_visits;users;pages_per_visit;bounce_rate;time_on_site\n' +
      'example.com;2026-08-01;1000000;400000;600000;750000;3.4567;0.4512;245\n',
  );
  assert.deepEqual(parseSemrushSummary(rows), {
    displayDate: '2026-08-01',
    visits: 1000000,
    desktopVisits: 400000,
    mobileVisits: 600000,
    pagesPerVisit: 3.46,
    bounceRatePct: 45.1,
    avgVisitDurationSec: 245,
    uniqueVisitors: 750000,
  });
  assert.equal(parseSemrushSummary([]), null);
});

test('Semrush CSV errors: NOTHING FOUND → empty, other errors throw', () => {
  assert.deepEqual(parseSemrushCsv('ERROR 50 :: NOTHING FOUND'), []);
  assert.throws(() => parseSemrushCsv('ERROR 120 :: WRONG KEY - ID PAIR'), /WRONG KEY/);
  assert.deepEqual(parseSemrushCsv(''), []);
});

test('Semrush geo + top pages parsers', () => {
  const geo = parseSemrushGeo(
    parseSemrushCsv('geo;traffic;traffic_share\nde;500;0.5\nus;300;0.3\nat;200;0.2\n'),
    2,
  );
  assert.deepEqual(geo, [
    { country: 'DE', sharePct: 50, visits: 500 },
    { country: 'US', sharePct: 30, visits: 300 },
  ]);
  const pages = parseSemrushTopPages(
    parseSemrushCsv('page;traffic_share\nexample.com;0.6123\nexample.com/shop;0.1\n;0.05\n'),
  );
  assert.deepEqual(pages, [
    { page: 'example.com', trafficSharePct: 61.2 },
    { page: 'example.com/shop', trafficSharePct: 10 },
  ]);
});

test('parseTrancoRanks returns the newest rank', () => {
  assert.equal(
    parseTrancoRanks({
      ranks: [
        { date: '2026-10-06', rank: 120 },
        { date: '2026-10-08', rank: 118 },
        { date: '2026-10-07', rank: 119 },
      ],
    }),
    118,
  );
  assert.equal(parseTrancoRanks({ ranks: [] }), undefined);
  assert.equal(parseTrancoRanks(null), undefined);
});

test('defaultDisplayDate is first day two months back', () => {
  assert.equal(defaultDisplayDate(new Date(Date.UTC(2026, 9, 9))), '2026-08-01');
  assert.equal(defaultDisplayDate(new Date(Date.UTC(2026, 0, 15))), '2025-11-01');
});

test('extractAppLinks: store links, smart-banner metas, dedupe', () => {
  const html = `
    <meta name="apple-itunes-app" content="app-id=123456789, app-argument=myapp://home">
    <meta name='google-play-app' content='app-id=com.example.android'>
    <a href="https://apps.apple.com/de/app/example-shop/id123456789">iOS</a>
    <a href="https://itunes.apple.com/us/app/other/id987654321?mt=8">Other</a>
    <a href="https://play.google.com/store/apps/details?id=com.example.android&amp;hl=de">Android</a>
    <a href="https://play.google.com/store/apps/details?hl=en&amp;id=com.example.second">Second</a>
    <a href="https://example.com/identity">no app</a>`;
  const links = extractAppLinks(html);
  assert.deepEqual(
    links.map((l) => `${l.store}:${l.appId}:${l.foundVia}`).sort(),
    [
      'apple:123456789:smart-banner-meta',
      'apple:987654321:website-link',
      'google:com.example.android:smart-banner-meta',
      'google:com.example.second:website-link',
    ],
  );
  assert.deepEqual(extractAppLinks('<html><body>No apps</body></html>'), []);
});

test('brand matching + iTunes mapping', () => {
  assert.equal(brandFromUrl('https://www.otto.de/shop'), 'otto');
  const app = {
    trackId: 42,
    trackName: 'OTTO – Shopping',
    sellerName: 'Otto GmbH & Co KG',
    trackViewUrl: 'https://apps.apple.com/de/app/otto/id42',
    artworkUrl100: 'https://img/100.png',
    averageUserRating: 4.7321,
    userRatingCount: 1234,
    version: '9.1',
    primaryGenreName: 'Shopping',
  };
  assert.equal(matchesBrand(app, 'otto'), true);
  assert.equal(matchesBrand({ trackName: 'Random', sellerName: 'Other Inc' }, 'otto'), false);
  assert.deepEqual(mapItunesApp(app, 'store-search'), {
    store: 'apple',
    appId: '42',
    name: 'OTTO – Shopping',
    publisher: 'Otto GmbH & Co KG',
    storeUrl: 'https://apps.apple.com/de/app/otto/id42',
    iconUrl: 'https://img/100.png',
    rating: 4.7,
    ratingCount: 1234,
    version: '9.1',
    genre: 'Shopping',
    foundVia: 'store-search',
  });
  assert.equal(mapItunesApp({ trackName: 'x' }, 'website-link'), null);
});

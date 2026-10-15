import assert from 'node:assert/strict';
import test from 'node:test';
import { assessPageHealth, detectionCountWarning } from '../src/services/pageHealth.js';
import { extractFromHtml } from '../src/services/httpFallbackScrape.js';
import { buildDetectionOnlyResult } from '../src/services/analyzer.js';
import { normalizeAnalysisResult } from '../src/db/analyses.js';
import { config } from '../src/config.js';
import { clearObservePointCache, listAudits, ObservePointError } from '../src/services/observepoint/client.js';
import type { ScrapedData } from '../src/services/scraper.js';

function page(over: Partial<ScrapedData>): ScrapedData {
  return {
    url: 'https://www.example.com', finalUrl: 'https://www.example.com', html: '', headers: {}, meta: {},
    scriptSrc: [], cookies: {}, title: '', bodyText: '', links: [], requests: [], jsGlobals: {}, edgeSignals: [],
    ...over,
  };
}
const codes = (s: ScrapedData) => assessPageHealth(s).warnings.map((w) => w.code);
const healthy = page({
  title: 'Welcome to Example Corp',
  bodyText: 'Products, services and news. '.repeat(100),
  html: '<html>' + '<div>content</div>'.repeat(500) + '</html>',
  status: 200,
});

test('pageHealth: healthy page has no warnings', () => {
  const h = assessPageHealth(healthy);
  assert.deepEqual(h.warnings, []);
  assert.equal(h.retryable, false);
});

test('pageHealth: AEM "Service Outage" page is flagged as retryable error page', () => {
  const h = assessPageHealth(page({ title: 'Service Outage', bodyText: 'We are experiencing a service outage. Please try again later.', html: '<html><body>Service Outage</body></html>', status: 200 }));
  assert.ok(h.warnings.some((w) => w.code === 'error_page' && w.severity === 'error'));
  assert.equal(h.retryable, true);
});

test('pageHealth: 503 status is retryable, 404 is not', () => {
  const h503 = assessPageHealth({ ...healthy, status: 503 });
  assert.ok(h503.warnings.some((w) => w.code === 'http_error'));
  assert.equal(h503.retryable, true);
  const h404 = assessPageHealth({ ...healthy, status: 404 });
  assert.ok(h404.warnings.some((w) => w.code === 'http_error'));
  assert.equal(h404.retryable, false);
});

test('pageHealth: Cloudflare challenge is a bot wall and not auto-retried', () => {
  const h = assessPageHealth(page({
    title: 'Just a moment...',
    html: '<html><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></html>',
    headers: { 'cf-mitigated': ['challenge'] },
    status: 403,
  }));
  assert.ok(h.warnings.some((w) => w.code === 'bot_challenge'));
  assert.equal(h.retryable, false);
});

test('pageHealth: thin content and HTTP fallback are reported', () => {
  assert.ok(codes(page({ title: 'Hi', bodyText: 'Hi', html: '<html>Hi</html>', status: 200 })).includes('thin_content'));
  assert.ok(codes({ ...healthy, scrapeMode: 'http' }).includes('http_fallback'));
});

test('detectionCountWarning only for very few detections', () => {
  assert.equal(detectionCountWarning(3)?.code, 'few_detections');
  assert.equal(detectionCountWarning(10), undefined);
});

test('extractFromHtml extracts meta, scripts, links, title, body text and cookies', () => {
  const html = `<html><head><title>Shop &amp; More</title>
    <meta name="generator" content="Adobe Experience Manager">
    <script src="https://assets.adobedtm.com/launch-123.min.js"></script>
    <script>var x = "<b>not text</b>";</script><style>.a{}</style></head>
    <body><a href="/about">About</a><p>Hello world</p></body></html>`;
  const d = extractFromHtml(html, 'https://shop.example', 'https://shop.example/', { 'set-cookie': ['AMCV_X=1; Path=/'] }, 200);
  assert.equal(d.title, 'Shop & More');
  assert.deepEqual(d.meta.generator, ['Adobe Experience Manager']);
  assert.ok(d.scriptSrc.includes('https://assets.adobedtm.com/launch-123.min.js'));
  assert.ok(d.links.some((l) => l.includes('/about')));
  assert.match(d.bodyText, /Hello world/);
  assert.doesNotMatch(d.bodyText, /not text/);
  assert.equal(d.cookies.AMCV_X, '1');
  assert.equal(d.status, 200);
  assert.equal(d.scrapeMode, 'http');
});

test('buildDetectionOnlyResult groups detections by category without AI text', () => {
  const r = buildDetectionOnlyResult([
    { name: 'Adobe Experience Manager', categories: ['CMS'], confidence: 100 },
    { name: 'Adobe Analytics', categories: ['Analytics'], confidence: 100, version: '2.x' },
    { name: 'Google Analytics', categories: ['Analytics'], confidence: 80 },
  ]);
  assert.match(r.summary, /AI summary unavailable/);
  const analytics = r.categories.find((c) => c.category === 'Analytics');
  assert.equal(analytics?.currentTechnology, 'Adobe Analytics 2.x, Google Analytics');
});

test('normalizeAnalysisResult repairs legacy/partial stored results', () => {
  const r = normalizeAnalysisResult(
    { summary: null, categories: [{ category: 'CMS' }, null], rawDetections: [{ name: 'AEM' }, { foo: 1 }], scanWarnings: 'x' },
    { url: 'https://a.example', analyzed_at: '2024-01-01T00:00:00Z' },
  );
  assert.equal(r.summary, '');
  assert.equal(r.url, 'https://a.example');
  assert.equal(r.categories.length, 1);
  assert.equal(r.categories[0]!.currentTechnology, '');
  assert.equal(r.rawDetections.length, 1);
  assert.deepEqual(r.rawDetections[0]!.categories, []);
  assert.equal(r.rawDetections[0]!.confidence, 0);
  assert.deepEqual(r.scanWarnings, []);
  assert.deepEqual(normalizeAnalysisResult(null).categories, []);
});

test('ObservePoint: 401 gives a clear message without leaking the key; 429 is retried', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = config.observepoint.apiKey;
  const quietWarn = console.warn;
  const quietErr = console.error;
  console.warn = () => {};
  console.error = () => {};
  process.env.OBSERVEPOINT_RETRY_BASE_MS = '0';
  (config.observepoint as { apiKey: string }).apiKey = 'secret-test-key-123';
  try {
    globalThis.fetch = (async () => new Response('{"message":"bad key"}', { status: 401 })) as typeof fetch;
    clearObservePointCache();
    const err = await listAudits().catch((e: unknown) => e);
    assert.ok(err instanceof ObservePointError);
    assert.equal(err.status, 401);
    assert.match(err.message, /API key/i);
    assert.doesNotMatch(err.message, /secret-test-key-123/);

    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return calls === 1 ? new Response('slow down', { status: 429 }) : Response.json([]);
    }) as typeof fetch;
    clearObservePointCache();
    assert.deepEqual(await listAudits(), []);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    (config.observepoint as { apiKey: string }).apiKey = originalKey;
    clearObservePointCache();
    console.warn = quietWarn;
    console.error = quietErr;
  }
});

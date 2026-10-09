import assert from 'node:assert/strict';
import test from 'node:test';
import { customDetect, DETECTION_RULES } from '../src/services/customDetectors.js';
import { detectTechnologies } from '../src/services/detector.js';
import { mergeDetections, selectRepresentativePages } from '../src/services/multiPageCrawl.js';
import type { ScrapedData } from '../src/services/scraper.js';
import { SIGNAL_LAYERS } from '../src/services/signalLayers.js';

// Keine echten DNS-Lookups in Unit-Tests (dnsSignals hat eigene Tests mit Fake-Resolver).
process.env.DNS_SIGNALS = '0';

function page(overrides: Partial<ScrapedData> = {}): ScrapedData {
  return {
    url: 'https://www.example.de/',
    finalUrl: 'https://www.example.de/',
    html: '<html><body>Hello</body></html>',
    headers: {},
    meta: {},
    scriptSrc: [],
    cookies: {},
    title: 'Example',
    bodyText: 'Hello',
    links: [],
    requests: [],
    jsGlobals: {},
    edgeSignals: [],
    ...overrides,
  };
}

const names = (s: ScrapedData) => customDetect(s).map((d) => d.name);

test('every signal layer targets an existing rule', () => {
  const ruleNames = new Set(DETECTION_RULES.map((r) => r.name));
  for (const layer of SIGNAL_LAYERS) assert.ok(ruleNames.has(layer.name), layer.name);
});

test('ECID cookie alone does not imply RTCDP, Analytics, Target or Launch', () => {
  const found = names(page({ cookies: { 'AMCV_ABCDEF0123456789ABCDEF01%40AdobeOrg': 'x', demdex: 'y' } }));
  assert.ok(found.includes('Adobe Experience Cloud Identity Service (ECID)'));
  for (const n of ['Adobe Real-Time CDP', 'Adobe Analytics', 'Adobe Target', 'Adobe Audience Manager', 'Adobe Experience Platform Tags (Launch)']) {
    assert.ok(!found.includes(n), `unexpected ${n}`);
  }
});

test('chat.js / format.js do not trigger Adobe Target', () => {
  const found = names(page({ scriptSrc: ['https://cdn.example.de/chat.js', 'https://cdn.example.de/format.js'] }));
  assert.ok(!found.includes('Adobe Target'));
});

test('td.js / sp.js substrings do not trigger Treasure Data / Snowplow', () => {
  const found = names(page({ scriptSrc: ['https://x.de/std.js', 'https://x.de/wasp.js'] }));
  assert.ok(!found.includes('Treasure Data'));
  assert.ok(!found.includes('Snowplow'));
});

test('_ga cookie alone does not imply Universal Analytics', () => {
  assert.ok(!names(page({ cookies: { _ga: 'GA1.2.1' } })).includes('Google Analytics (Universal)'));
});

test('Analytics beacon yields report suites, first-party tracking server and version', async () => {
  const [aa] = (await detectTechnologies(
    page({
      requests: ['https://smetrics.example.de/b/ss/exprod%2Cexglobal/1/JS-2.25.0/s123?AQB=1'],
      cookies: { 'AMCV_ABCDEF0123456789ABCDEF01%40AdobeOrg': 'x' },
    }),
  )).filter((d) => d.name === 'Adobe Analytics');
  assert.ok(aa, 'Adobe Analytics not detected');
  assert.ok(aa.confidence >= 90);
  assert.equal(aa.version, '2.25.0');
  assert.ok(aa.evidence?.some((e) => e.includes('exprod') && e.includes('exglobal')));
  assert.ok(aa.evidence?.some((e) => e.includes('first-party CNAME')));
});

test('Edge decisioning signals detect Target, AJO and RTCDP with evidence', async () => {
  const detected = await detectTechnologies(
    page({
      requests: ['https://edge.adobedc.net/ee/v2/interact?configId=0f1e2d3c-4b5a-6978-8091-a2b3c4d5e6f7'],
      edgeSignals: ['decisionProvider:TGT', 'decisionProvider:AJO', 'handle:activation:push'],
    }),
  );
  const found = detected.map((d) => d.name);
  for (const n of ['Adobe Target', 'Adobe Journey Optimizer', 'Adobe Real-Time CDP', 'Adobe Experience Platform Web SDK']) {
    assert.ok(found.includes(n), `missing ${n}`);
  }
  const sdk = detected.find((d) => d.name === 'Adobe Experience Platform Web SDK');
  assert.ok(sdk?.evidence?.some((e) => e.includes('0f1e2d3c-4b5a-6978-8091-a2b3c4d5e6f7')));
});

test('JS globals and fired pixels are detected', () => {
  const found = names(
    page({
      jsGlobals: { 'tealium.utag': '4.50', 'meta.fbq': 'present' },
      requests: ['https://px.ads.linkedin.com/collect?pid=1'],
    }),
  );
  for (const n of ['Tealium iQ', 'Facebook / Meta Pixel', 'LinkedIn Insight Tag']) assert.ok(found.includes(n), n);
});

test('mergeDetections unions evidence without duplicates', () => {
  const base = [{ name: 'X', categories: ['A'], confidence: 80, evidence: ['a'] }];
  const extra = [{ name: 'X', categories: ['A'], confidence: 90, evidence: ['a', 'b'] }];
  const [m] = mergeDetections(base, extra);
  assert.deepEqual(m.evidence, ['a', 'b']);
  assert.equal(m.confidence, 90);
});

test('mergeDetections keeps ⚠ warnings even when evidence is capped', () => {
  const base = [{ name: 'X', categories: ['A'], confidence: 80, evidence: ['1', '2', '3', '4', '5', '6', '7', '8'] }];
  const extra = [{ name: 'X', categories: ['A'], confidence: 80, evidence: ['⚠ warn'] }];
  const [m] = mergeDetections(base, extra);
  assert.equal(m.evidence?.[0], '⚠ warn');
  assert.equal(m.evidence?.length, 8);
});

test('selectRepresentativePages prioritises journey pages, one per type, same host only', () => {
  const pages = selectRepresentativePages('https://www.shop.de/', [
    'https://www.shop.de/about',
    'https://www.shop.de/blog/x',
    'https://www.shop.de/login',
    'https://www.shop.de/product/1',
    'https://www.shop.de/product/2',
    'https://other.de/cart',
    'https://www.shop.de/cart',
    'https://www.shop.de/search?q=a',
    'https://www.shop.de/kontakt',
  ]);
  assert.deepEqual(pages, [
    'https://www.shop.de/product/1',
    'https://www.shop.de/cart',
    'https://www.shop.de/login',
    'https://www.shop.de/search?q=a',
    'https://www.shop.de/blog/x',
  ]);
});

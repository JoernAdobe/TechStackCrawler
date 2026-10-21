import assert from 'node:assert/strict';
import test from 'node:test';
import { createPageFetcher, extractPublishedDate, extractReadable } from '../src/services/briefing/research/fetchPage.js';
import type { HttpGet } from '../src/services/briefing/research/http.js';
import { SourceLedger } from '../src/services/briefing/research/ledger.js';
import { createSerialLimiter, TtlCache } from '../src/services/briefing/research/limits.js';
import { blockedDomainReason, isPaywalled } from '../src/services/briefing/research/policy.js';
import { padCik, parseCompanyFacts, parseGleifRecord } from '../src/services/briefing/research/registries.js';
import { createDuckDuckGoSearch, decodeDdgHref, isDdgBlocked, parseDuckDuckGoHtml, type SearchHit } from '../src/services/briefing/research/search.js';
import { clientKey, formatMonYear, isClientOwned } from '../src/services/briefing/research/text.js';
import { parseWikidataEntity, websiteMatches } from '../src/services/briefing/research/wiki.js';

const DDG_HTML = `
<div class="result"><h2><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.reuters.com%2Fbusiness%2Fporsche-q3%3Fx%3D1&amp;rut=abc">Porsche <b>Q3</b> results</a></h2>
<a class="result__snippet" href="#">Porsche reported &amp; revenue of <b>€28bn</b>.</a></div>
<div class="result"><a class="result__a" href="https://duckduckgo.com/y.js?ad_domain=foo.com">Ad</a></div>
<div class="result"><a class="result__a" href="https://www.zoominfo.com/c/porsche/123">Porsche | ZoomInfo</a><div class="result__snippet">People data</div></div>
<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnewsroom.porsche.com%2Fen.html">Newsroom</a></div>`;

test('DDG: parse results, decode uddg redirect, drop ads', () => {
  const hits = parseDuckDuckGoHtml(DDG_HTML);
  assert.equal(hits.length, 3);
  assert.deepEqual(hits[0], { title: 'Porsche Q3 results', url: 'https://www.reuters.com/business/porsche-q3?x=1', snippet: 'Porsche reported & revenue of €28bn.' });
  assert.equal(hits[2].url, 'https://newsroom.porsche.com/en.html');
  assert.equal(decodeDdgHref('https://duckduckgo.com/y.js?ad_domain=x'), null);
  assert.equal(decodeDdgHref('javascript:alert(1)'), null);
});

test('DDG: block detection (HTTP 202 / anomaly page)', () => {
  assert.equal(isDdgBlocked(202, ''), true);
  assert.equal(isDdgBlocked(200, '<form id="challenge-form"><script src="/anomaly.js">'), true);
  assert.equal(isDdgBlocked(200, DDG_HTML), false);
});

function fakeClock() {
  let t = 1_000_000;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

test('DDG search: serialized with min interval, cached, aggregators dropped', async () => {
  const clock = fakeClock();
  const urls: string[] = [];
  const httpGet: HttpGet = async (url) => {
    urls.push(url);
    return { status: 200, url, text: DDG_HTML, contentType: 'text/html' };
  };
  const search = createDuckDuckGoSearch({
    httpGet,
    schedule: createSerialLimiter(1_200, clock),
    cache: new TtlCache<SearchHit[]>(60_000, 100, clock.now),
    now: clock.now,
  });
  const [a, b] = await Promise.all([search.search('porsche revenue'), search.search('porsche ceo')]);
  assert.ok(a.ok && b.ok);
  assert.equal(urls.length, 2);
  assert.deepEqual(clock.sleeps, [1_200]);
  if (a.ok) {
    assert.equal(a.cached, false);
    assert.deepEqual(a.dropped, ['zoominfo.com']);
    assert.ok(!a.hits.some((h) => h.url.includes('zoominfo')));
  }
  const again = await search.search('  Porsche   REVENUE ');
  assert.ok(again.ok && again.cached);
  assert.equal(urls.length, 2);
});

test('DDG search: captcha → error without retry loop, cooldown afterwards', async () => {
  let calls = 0;
  const httpGet: HttpGet = async (url) => {
    calls++;
    return { status: 202, url, text: '<html>anomaly</html>', contentType: 'text/html' };
  };
  const search = createDuckDuckGoSearch({ httpGet, schedule: (t) => t(), cache: new TtlCache(60_000) });
  const r1 = await search.search('x');
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.match(r1.error, /blocked/i);
  const r2 = await search.search('y');
  assert.equal(r2.ok, false);
  assert.equal(calls, 1);
});

test('DDG search: network errors retried at most twice', async () => {
  let calls = 0;
  const httpGet: HttpGet = async () => {
    calls++;
    throw new Error('ECONNRESET');
  };
  const search = createDuckDuckGoSearch({ httpGet, schedule: (t) => t(), cache: new TtlCache(60_000) });
  const r = await search.search('x');
  assert.equal(r.ok, false);
  assert.equal(calls, 2);
});

test('extractPublishedDate: meta, JSON-LD, <time>', () => {
  assert.equal(extractPublishedDate('<meta property="article:published_time" content="2025-03-14T10:00:00Z">'), 'Mar 2025');
  assert.equal(extractPublishedDate('<script type="application/ld+json">{"datePublished":"2024-11-02"}</script>'), 'Nov 2024');
  assert.equal(extractPublishedDate('<p><time datetime="2023-01-20">Jan 20</time></p>'), 'Jan 2023');
  assert.equal(extractPublishedDate('<p>no date</p>'), null);
  assert.equal(formatMonYear('2026-07-01'), 'Jul 2026');
});

test('extractReadable: strips nav/scripts, prefers article, caps at 8k', () => {
  const html = `<html><head><title>Big &amp; News</title><script>var x=1</script></head><body><nav>Menu</nav><article><p>${'Lorem ipsum dolor. '.repeat(600)}</p></article><footer>Imprint</footer></body></html>`;
  const { title, text } = extractReadable(html);
  assert.equal(title, 'Big & News');
  assert.ok(!text.includes('Menu') && !text.includes('var x'));
  assert.equal(text.length, 8_000);
});

test('fetch_page: blocks aggregators, PDFs and non-http; 403 not retried', async () => {
  let calls = 0;
  const fetcher = createPageFetcher({
    cache: new TtlCache(60_000),
    httpGet: async (url) => {
      calls++;
      return { status: 403, url, text: '', contentType: 'text/html' };
    },
  });
  for (const u of ['https://www.linkedin.com/in/x', 'https://rocketreach.co/p', 'https://theorg.com/acme', 'https://x.com/a.pdf', 'file:///etc/passwd']) {
    const r = await fetcher.fetch(u);
    assert.equal(r.ok, false, u);
  }
  assert.equal(calls, 0);
  const r = await fetcher.fetch('https://example.com/news');
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /403/);
  assert.equal(calls, 1);
});

test('fetch_page: success with date and paywall flag', async () => {
  const fetcher = createPageFetcher({
    cache: new TtlCache(60_000),
    httpGet: async (url) => ({
      status: 200,
      url,
      contentType: 'text/html; charset=utf-8',
      text: `<html><head><title>FT story</title><meta name="date" content="2025-06-01"></head><body><article>${'Revenue grew strongly this year. '.repeat(20)}</article></body></html>`,
    }),
  });
  const r = await fetcher.fetch('https://www.ft.com/content/abc');
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.paywalled, true);
    assert.equal(r.date, 'Jun 2025');
  }
});

test('policy: aggregator and paywall domains', () => {
  assert.match(blockedDomainReason('https://www.zoominfo.com/c/x') ?? '', /aggregator/i);
  assert.ok(blockedDomainReason('https://de.linkedin.com/company/x'));
  assert.equal(blockedDomainReason('https://www.reuters.com/x'), null);
  assert.equal(isPaywalled('https://www.handelsblatt.com/x'), true);
});

test('isClientOwned: declared domains or company key in host label', () => {
  const key = clientKey('Dr. Ing. h.c. F. Porsche AG');
  assert.equal(isClientOwned('https://newsroom.porsche.com/x', ['porsche.com'], 'porsche'), true);
  assert.equal(isClientOwned('https://www.porsche-holding.at/', ['porsche.com'], 'porsche'), true);
  assert.equal(isClientOwned('https://www.reuters.com/porsche', ['porsche.com'], 'porsche'), false);
  assert.ok(key.length > 0);
});

test('Wikidata entity parsing: preferred/current claims, latest employees', () => {
  const snak = (value: unknown) => ({ datavalue: { value } });
  const parsed = parseWikidataEntity({
    id: 'Q40993',
    modified: '2026-05-10T00:00:00Z',
    labels: { en: { value: 'Porsche' } },
    claims: {
      P571: [{ mainsnak: snak({ time: '+1931-04-25T00:00:00Z' }) }],
      P1128: [
        { mainsnak: snak({ amount: '+30000' }), qualifiers: { P585: [snak({ time: '+2019-01-01T00:00:00Z' })] } },
        { mainsnak: snak({ amount: '+42000' }), qualifiers: { P585: [snak({ time: '+2024-01-01T00:00:00Z' })] } },
      ],
      P2139: [{ mainsnak: snak({ amount: '+40000000000', unit: 'http://www.wikidata.org/entity/Q4916' }) }],
      P159: [{ mainsnak: snak({ id: 'Q1022' }) }],
      P169: [
        { mainsnak: snak({ id: 'Q1' }), qualifiers: { P582: [snak({ time: '+2015-01-01T00:00:00Z' })] } },
        { mainsnak: snak({ id: 'Q2' }) },
      ],
      P856: [{ mainsnak: snak('https://www.porsche.com') }],
      P1278: [{ mainsnak: snak('529900ABCDEFGHIJKL12') }],
    },
  });
  assert.equal(parsed.facts.founded, '1931');
  assert.deepEqual(parsed.facts.employees, { value: 42000, asOf: '2024' });
  assert.equal(parsed.facts.revenue?.currency, 'EUR');
  assert.equal(parsed.ceoId, 'Q2');
  assert.equal(parsed.hqId, 'Q1022');
  assert.equal(parsed.facts.date, 'May 2026');
  assert.equal(websiteMatches(parsed.facts.website, 'www.porsche.com'), true);
  assert.equal(websiteMatches('https://www.vw.com', 'porsche.com'), false);
});

test('SEC company facts: latest annual revenue + net income', () => {
  const f = (val: number, start: string, end: string, form = '10-K', filed = `${end.slice(0, 4)}-11-01`) => ({ val, start, end, form, filed, fy: Number(end.slice(0, 4)), fp: 'FY' });
  const res = parseCompanyFacts(
    {
      entityName: 'Adobe Inc.',
      facts: {
        'us-gaap': {
          Revenues: { units: { USD: [f(19_400, '2023-12-01', '2024-11-29'), f(21_500, '2024-11-30', '2025-11-28'), f(5_000, '2025-06-01', '2025-08-29', '10-Q')] } },
          NetIncomeLoss: { units: { USD: [f(5_500, '2023-12-01', '2024-11-29'), f(7_100, '2024-11-30', '2025-11-28')] } },
        },
      },
    },
    '0000796343',
    'https://data.sec.gov/x.json',
  );
  assert.equal(res.revenue?.value, 21_500);
  assert.equal(res.revenuePrior?.value, 19_400);
  assert.equal(res.netIncome?.value, 7_100);
  assert.equal(res.date, 'Nov 2025');
  assert.equal(padCik('796343'), '0000796343');
  assert.equal(padCik('abc'), null);
});

test('GLEIF record parsing', () => {
  const r = parseGleifRecord({
    id: '529900ABCDEFGHIJKL12',
    attributes: {
      lei: '529900ABCDEFGHIJKL12',
      entity: { legalName: { name: 'Dr. Ing. h.c. F. Porsche AG' }, headquartersAddress: { city: 'Stuttgart', country: 'DE' }, status: 'ACTIVE' },
      registration: { lastUpdateDate: '2026-02-03T00:00:00Z' },
    },
  });
  assert.equal(r?.legalName, 'Dr. Ing. h.c. F. Porsche AG');
  assert.equal(r?.hqCity, 'Stuttgart');
  assert.equal(r?.date, 'Feb 2026');
  assert.equal(parseGleifRecord({ id: 'x' }), null);
});

test('ledger: normalized lookup, fetched beats search, aliases', () => {
  const ledger = new SourceLedger();
  ledger.record({ url: 'https://www.example.com/a?utm_source=x', title: 'A', publisher: 'example.com', date: null, kind: 'search' });
  ledger.record({ url: 'https://www.example.com/a', title: 'A full', publisher: 'example.com', date: 'Jan 2026', kind: 'fetched' }, ['http://example.com/a-short']);
  assert.equal(ledger.get('https://www.example.com/a')?.kind, 'fetched');
  assert.equal(ledger.get('http://example.com/a-short')?.title, 'A full');
  ledger.record({ url: 'https://www.example.com/a', title: 'snip', publisher: 'example.com', date: null, kind: 'search' });
  assert.equal(ledger.get('https://www.example.com/a')?.kind, 'fetched');
});

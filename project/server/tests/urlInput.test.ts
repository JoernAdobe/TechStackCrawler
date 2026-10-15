import assert from 'node:assert/strict';
import test from 'node:test';
import { validateUrlInput } from '../src/utils/urlInput.js';
import { damerauLevenshtein, suggestDomain, KNOWN_DOMAINS } from '../src/services/domainSuggest.js';
import { classifyProbeError, preflightUrl, type PreflightDeps, type ProbeOutcome } from '../src/services/urlPreflight.js';

// Keine echten DNS-/HTTP-Zugriffe: alle Preflight-Tests laufen mit injizierten Fakes.
process.env.DNS_SIGNALS = '0';

function code(input: unknown): string {
  const r = validateUrlInput(input);
  return r.ok ? 'ok' : r.code;
}

test('validateUrlInput: accepts and normalizes typical inputs', () => {
  const cases: Array<[string, string]> = [
    ['bmw.com', 'https://bmw.com/'],
    ['  BMW.COM  ', 'https://bmw.com/'],
    ['bmw.com.', 'https://bmw.com/'],
    ['http://bmw.com/de/models?x=1#top', 'http://bmw.com/de/models?x=1'],
    ['https:/bmw.com', 'https://bmw.com/'],
    ['http//bmw.com', 'http://bmw.com/'],
    ['<https://bmw.com>', 'https://bmw.com/'],
    ['"bmw.com"', 'https://bmw.com/'],
    ['münchen.de', 'https://xn--mnchen-3ya.de/'],
    ['shop.example.co.uk', 'https://shop.example.co.uk/'],
  ];
  for (const [input, expected] of cases) {
    const r = validateUrlInput(input);
    assert.ok(r.ok, `${input} should be valid`);
    assert.equal(r.url, expected, input);
  }
});

test('validateUrlInput: rejects user errors with specific codes', () => {
  assert.equal(code(''), 'url_empty');
  assert.equal(code('   '), 'url_empty');
  assert.equal(code(undefined), 'url_empty');
  assert.equal(code('bmw.com audi.com'), 'multiple_urls');
  assert.equal(code('bmw.com, audi.de'), 'multiple_urls');
  assert.equal(code('bmw .com'), 'url_whitespace');
  assert.equal(code('ftp://bmw.com'), 'unsupported_scheme');
  assert.equal(code('javascript:alert(1)'), 'unsupported_scheme');
  assert.equal(code('mailto:info@bmw.com'), 'unsupported_scheme');
  assert.equal(code('https://user:pw@bmw.com'), 'url_credentials');
  assert.equal(code('bmw'), 'invalid_host');
  assert.equal(code('bmw..com'), 'invalid_host');
  assert.equal(code('bm_w.com'), 'invalid_host');
  assert.equal(code('-bmw.com'), 'invalid_host');
  assert.equal(code('bmw.c'), 'invalid_tld');
  assert.ok(['invalid_url', 'invalid_tld'].includes(code('bmw.123')));
  assert.equal(code('x'.repeat(3000) + '.com'), 'url_too_long');
});

test('validateUrlInput: TLD typos get a suggestion', () => {
  const r = validateUrlInput('bmw.con');
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.code, 'invalid_tld');
    assert.equal(r.suggestion, 'bmw.com');
  }
});

test('validateUrlInput: SSRF targets stay blocked', () => {
  for (const bad of ['localhost', 'localhost:3001', 'http://127.0.0.1', '10.0.0.1', '192.168.1.1', '[::1]', 'printer.local', 'foo.internal', '169.254.169.254']) {
    assert.equal(code(bad), 'url_disallowed', bad);
  }
});

test('damerauLevenshtein counts a transposition as one edit', () => {
  assert.equal(damerauLevenshtein('bwm', 'bmw'), 1);
  assert.equal(damerauLevenshtein('amazn', 'amazon'), 1);
  assert.equal(damerauLevenshtein('facbok', 'facebook'), 2);
  assert.equal(damerauLevenshtein('abc', 'abc'), 0);
  assert.equal(damerauLevenshtein('', 'abc'), 3);
});

test('suggestDomain: finds brand typos, respects TLD and thresholds', () => {
  assert.equal(suggestDomain('bwm.com', KNOWN_DOMAINS), 'bmw.com');
  assert.equal(suggestDomain('www.bwm.com', KNOWN_DOMAINS), 'bmw.com');
  assert.equal(suggestDomain('addidas.com', KNOWN_DOMAINS), 'adidas.com');
  assert.equal(suggestDomain('zalanod.de', KNOWN_DOMAINS), 'zalando.de');
  // Exakter Treffer → kein Vorschlag.
  assert.equal(suggestDomain('bmw.com', KNOWN_DOMAINS), null);
  // Andere Domain-Endung wird nie "korrigiert".
  assert.equal(suggestDomain('bmw.at', KNOWN_DOMAINS), null);
  // Zu weit weg / zu kurz.
  assert.equal(suggestDomain('bxyz.com', KNOWN_DOMAINS), null);
  assert.equal(suggestDomain('hp.com', ['bp.com']), null);
  // Kandidaten aus früheren Analysen.
  assert.equal(suggestDomain('acme-shpo.de', ['https://www.acme-shop.de/']), 'acme-shop.de');
});

function deps(overrides: Partial<PreflightDeps> & { probes?: ProbeOutcome[] }): Partial<PreflightDeps> {
  const probes = overrides.probes ?? ['reachable', 'reachable'];
  let i = 0;
  return {
    lookup: overrides.lookup ?? (async () => [{ address: '93.184.216.34', family: 4 }]),
    probe: overrides.probe ?? (async () => probes[i++ % probes.length]),
    suggest: overrides.suggest ?? (async (h) => suggestDomain(h, KNOWN_DOMAINS)),
  };
}

const nxdomain = async () => {
  throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
};

test('preflightUrl: NXDOMAIN fails fast with suggestion', async () => {
  const r = await preflightUrl('https://bwm.com/', deps({ lookup: nxdomain }));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.code, 'domain_not_found');
    assert.equal(r.suggestion, 'bmw.com');
    assert.match(r.hint, /Did you mean bmw\.com\?/);
  }
});

test('preflightUrl: NXDOMAIN suggests www variant when only that exists', async () => {
  const r = await preflightUrl('https://acme-unique-shop.de/', deps({
    lookup: async (h) => (h.startsWith('www.') ? [{ address: '93.184.216.34', family: 4 }] : nxdomain()),
  }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.suggestion, 'www.acme-unique-shop.de');
});

test('preflightUrl: resolves but never answers + typo candidate → fail with suggestion (bwm.com case)', async () => {
  const r = await preflightUrl('https://bwm.com/', deps({ probes: ['timeout', 'timeout'] }));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.code, 'site_unreachable');
    assert.equal(r.suggestion, 'bmw.com');
  }
});

test('preflightUrl: slow site without typo candidate is NOT blocked (scraper decides)', async () => {
  const r = await preflightUrl('https://some-slow-site.com/', deps({ probes: ['timeout', 'timeout'] }));
  assert.equal(r.ok, true);
});

test('preflightUrl: connection refused on both schemes fails even without suggestion', async () => {
  const r = await preflightUrl('https://some-dead-site.com/', deps({ probes: ['refused', 'refused'] }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, 'site_unreachable');
});

test('preflightUrl: one scheme reachable or TLS error → ok', async () => {
  assert.equal((await preflightUrl('https://bwm.com/', deps({ probes: ['timeout', 'reachable'] }))).ok, true);
  assert.equal((await preflightUrl('https://bwm.com/', deps({ probes: ['tls', 'timeout'] }))).ok, true);
});

test('preflightUrl: DNS answer with private IP is blocked', async () => {
  const r = await preflightUrl('https://evil.example.com/', deps({ lookup: async () => [{ address: '169.254.169.254', family: 4 }] }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, 'url_disallowed');
});

test('preflightUrl: temporary DNS failure is reported separately', async () => {
  const r = await preflightUrl('https://bmw.com/', deps({
    lookup: async () => {
      throw Object.assign(new Error('EAI_AGAIN'), { code: 'EAI_AGAIN' });
    },
  }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, 'dns_failed');
});

test('classifyProbeError maps safeFetch errors', () => {
  assert.equal(classifyProbeError(Object.assign(new Error('The operation was aborted'), { code: 'ABORT_ERR' })), 'timeout');
  assert.equal(classifyProbeError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })), 'refused');
  assert.equal(classifyProbeError(new Error('Response body too large')), 'reachable');
  assert.equal(classifyProbeError(Object.assign(new Error('cert'), { code: 'CERT_HAS_EXPIRED' })), 'tls');
  assert.equal(classifyProbeError(new Error('Blocked URL (private/unresolvable address): x')), 'blocked');
});

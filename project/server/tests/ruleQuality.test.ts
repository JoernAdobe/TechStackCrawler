/**
 * Regressionstests zur Regelqualität (docs/library-research/02–04).
 * Teil 1 ist datengetrieben aus 04-rule-fixes.json: jeder Testfall wird gegen die ECHTE Regel
 * (customDetect) geprüft, nicht gegen das Literal im JSON.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cookieMatches, customDetect, DETECTION_RULES } from '../src/services/customDetectors.js';
import { techstackIndex } from '../src/services/evidenceMatrix.js';
import { canonicalKeyForTechstack, isIgnoredOpTag } from '../src/services/observepoint/canonicalNames.js';
import type { ScrapedData } from '../src/services/scraper.js';

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

// ── Teil 1: 04-rule-fixes.json ────────────────────────────────────────────────
interface FixCase {
  field: 'html' | 'scriptSrc' | 'requests' | 'cookies' | 'headers' | 'canonical';
  pattern?: string;
  shouldMatch?: string[];
  shouldNotMatch?: string[];
  url?: string;
  urls?: string[];
  html?: string;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  input?: string;
  expect?: string | string[];
  expectNot?: string | string[];
  expectExactlyOneOf?: string[];
  expectEvidenceCount?: number;
}
interface Fix { rule: string; severity: string; testCase: FixCase }

const here = dirname(fileURLToPath(import.meta.url));
const FIXES: Fix[] = JSON.parse(readFileSync(resolve(here, '../../../docs/library-research/04-rule-fixes.json'), 'utf8'));

/** Sammel-Fixes: Regel, an der der Testfall exemplarisch hängt. */
const RULE_FOR_FIX: Record<string, string> = {
  'Generische HTML-Wörter (CMS/Commerce/MarTech)': 'Oxid eShop',
  'Adobe-Erwähnungs-Regeln (AJO, CJA, Adobe Sign, Workfront, GenStudio)': 'Adobe Sign',
  'Payment-Logo-Regeln (Apple Pay, Google Pay, PayPal, Stripe)': 'Apple Pay',
  'Generische scriptSrc-Wörter (Gatsby, Svelte, Preact, Countly, Klaro, Borlabs, Typesense, Metrika, mPulse)': 'mPulse (Akamai)',
  'Unverankerte Domain-Patterns (impact.com, convert.com, shape.com, oath.com, checkout.com, shop.app)': 'Shape Security (F5)',
};
/** Bewusst nicht als Regeltest umgesetzt (siehe Bericht). */
const SKIP = new Set(['Version-Extraktion']);

const asList = (v?: string | string[]) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function pageFor(field: FixCase['field'], value: string): ScrapedData {
  if (field === 'html') return page({ html: `<html><body>${value}</body></html>` });
  if (field === 'scriptSrc') return page({ scriptSrc: [value] });
  if (field === 'requests') return page({ requests: [value] });
  throw new Error(`pattern-Testfall mit Feld ${field} nicht unterstützt`);
}

for (const [i, fix] of FIXES.entries()) {
  const tc = fix.testCase;
  const label = `04-Fix #${i} (${fix.severity}): ${fix.rule}`;
  if (SKIP.has(fix.rule)) {
    test(label, { skip: 'Versions-Extraktion ist ein Feature-Vorschlag, kein Erkennungsfix' }, () => {});
    continue;
  }
  test(label, () => {
    if (tc.field === 'canonical') {
      assert.equal(canonicalKeyForTechstack(tc.input!), canonicalKeyForTechstack(tc.expect as string));
      return;
    }
    if (tc.pattern) {
      const rule = RULE_FOR_FIX[fix.rule] ?? fix.rule;
      assert.ok(DETECTION_RULES.some((r) => r.name === rule), `Regel ${rule} existiert`);
      for (const s of tc.shouldMatch ?? []) assert.ok(names(pageFor(tc.field, s)).includes(rule), `${rule} sollte ${s} erkennen`);
      for (const s of tc.shouldNotMatch ?? []) assert.ok(!names(pageFor(tc.field, s)).includes(rule), `${rule} darf ${s} nicht erkennen`);
      return;
    }
    const urls = tc.urls ?? (tc.url ? [tc.url] : []);
    const p =
      tc.field === 'cookies' ? page({ cookies: tc.cookies })
      : tc.field === 'headers'
        ? page({ headers: Object.fromEntries(Object.entries(tc.headers ?? {}).map(([k, v]) => [k, [v]])) })
      : tc.field === 'html' ? page({ html: `<html><body>${tc.html}</body></html>` })
      : tc.field === 'requests' ? page({ requests: urls })
      : page({ scriptSrc: urls });
    const detected = customDetect(p);
    const found = detected.map((d) => d.name);
    for (const n of asList(tc.expect)) assert.ok(found.includes(n), `erwartet: ${n} (gefunden: ${found.join(', ')})`);
    for (const n of asList(tc.expectNot)) assert.ok(!found.includes(n), `unerwartet: ${n}`);
    if (tc.expectExactlyOneOf) assert.equal(tc.expectExactlyOneOf.filter((n) => found.includes(n)).length, 1);
    if (tc.expectEvidenceCount !== undefined) {
      // customDetect liefert keine URL-Evidenz je Pattern; geprüft wird die Ursache des Fixes:
      // Signal-Layer dürfen keine Request-Patterns doppeln (sonst doppelte Belege).
      const rule = DETECTION_RULES.find((r) => r.name === fix.rule)!;
      assert.ok(found.includes(rule.name));
      const reqs = (rule.patterns.requests ?? []).map(String);
      assert.equal(reqs.length, new Set(reqs).size, `doppelte Request-Patterns: ${reqs.join(' ')}`);
    }
  });
}

// ── Teil 2: Engine – Cookie-Präfixe ──────────────────────────────────────────
test('cookieMatches: Präfix inkl. Trennzeichen, sonst exakt, RegExp per test()', () => {
  assert.ok(cookieMatches('PrestaShop-', 'PrestaShop-1a2b'));
  assert.ok(cookieMatches('scarab.', 'scarab.visitor'));
  assert.ok(cookieMatches('intercom-', 'intercom-session-abc'));
  assert.ok(!cookieMatches('_ga_', '_ga'), '_ga_ trifft nicht _ga');
  assert.ok(!cookieMatches('uc_user_interaction', 'uc_layout'));
  assert.ok(!cookieMatches('_vwo_', '_vwoxyz'), 'Präfix gilt inkl. abschließendem _');
  assert.ok(cookieMatches(/^_px\d$/, '_px3'));
  assert.ok(!cookieMatches('TDID', 'TDID_x'));
});

test('Cookie-Kollisionen: TikTok _tt_enable_cookie ist nicht The Trade Desk, Snowplow nicht Sourcepoint', () => {
  assert.ok(!names(page({ cookies: { _tt_enable_cookie: '1' } })).includes('The Trade Desk'));
  const sp = names(page({ cookies: { '_sp_id.1fff': 'x' } }));
  assert.ok(sp.includes('Snowplow') && !sp.includes('Sourcepoint'));
  assert.ok(!names(page({ cookies: { mp_abc_mixpanel: 'x' } })).includes('mParticle'));
});

test('Wort-Regeln: Produktname im Fließtext oder als Hersteller-Link ist kein Beleg', () => {
  const html = '<p>Wir migrieren von Shopware zu Spryker; mehr unter <a href="https://www.sitecore.com/">Sitecore</a>.</p>';
  const found = names(page({ html }));
  for (const n of ['Shopware', 'Spryker', 'Sitecore']) assert.ok(!found.includes(n), n);
  assert.ok(names(page({ html: '<link href="/bundles/storefront/shopware.css">' })).includes('Shopware'));
});

test('Konfidenz-Deckel: CJA-Embed bleibt bei maxConfidence 60', () => {
  const d = customDetect(page({ html: '<iframe src="https://acme.cja.adobe.com/embed/x"></iframe>' })).find(
    (x) => x.name === 'Adobe Customer Journey Analytics',
  );
  assert.ok(d && d.confidence <= 60);
});

// ── Teil 3: neue Regeln (je ein positiver Test) ──────────────────────────────
const POSITIVE: Array<[string, Partial<ScrapedData>]> = [
  // 02 – OP-Gap
  ['Google Tag (gtag.js)', { scriptSrc: ['https://www.googletagmanager.com/gtag/js?id=G-ABC123'] }],
  ['Google Fonts', { requests: ['https://fonts.googleapis.com/css2?family=Inter'] }],
  ['Font Awesome', { scriptSrc: ['https://kit.fontawesome.com/0a1b2c3d4e.js'] }],
  ['Google Maps JavaScript API', { scriptSrc: ['https://maps.googleapis.com/maps/api/js?key=x'] }],
  ['Moment.js', { scriptSrc: ['/js/moment-with-locales.min.js'] }],
  ['Tapad (Experian)', { requests: ['https://pixel.tapad.com/idsync/ex/receive?partner_id=1'] }],
  ['ZoomInfo (WebSights)', { scriptSrc: ['https://js.zi-scripts.com/zi-tag.js'] }],
  ['6sense', { scriptSrc: ['https://j.6sc.co/6si.min.js'] }],
  ['Demandbase', { scriptSrc: ['https://tag.demandbase.com/abc.min.js'] }],
  ['Bombora', { requests: ['https://ml314.com/utsync.ashx?pub=1'] }],
  ['G2 Buyer Intent', { scriptSrc: ['https://tracking.g2crowd.com/attribution_tracking/conversions/1234.js'] }],
  ['Madison Logic', { requests: ['https://s.ml-attr.com/getuid?x=1'] }],
  ['Dun & Bradstreet Audience', { cookies: { D41ID: 'x' } }],
  ['BidSwitch', { requests: ['https://x.bidswitch.net/sync?ssp=x'] }],
  ['StackAdapt', { scriptSrc: ['https://tags.srv.stackadapt.com/events.js'] }],
  ['LiveIntent', { scriptSrc: ['https://b-code.liadm.com/a-01ab.min.js'] }],
  ['Claritas (Barometric / ArtsAI)', { requests: ['https://trkn.us/pixel/conv/ppt=1'] }],
  ['Simpli.fi', { requests: ['https://tag.simpli.fi/sifitag/abc'] }],
  ['Spotify Ad Analytics (Podsights)', { scriptSrc: ['https://pixel.byspotify.com/ping.min.js'] }],
  ['Yahoo! JAPAN Ads', { scriptSrc: ['https://s.yimg.jp/images/listing/tool/cv/ytag.js'] }],
  ['Basis (Centro / SiteScout)', { requests: ['https://pixel.sitescout.com/iap/abc'] }],
  ['Dstillery', { requests: ['https://action.dstillery.com/orbserv/nsjs?adv=1'] }],
  ['RTB House', { cookies: { '__rtbh.lid': 'x' } }],
  ['LINE Tag', { scriptSrc: ['https://d.line-scdn.net/n/line_tag/public/release/v1/lt.js'] }],
  ['Adara', { requests: ['https://tag.yieldoptimizer.com/ps/ps?t=s&p=1'] }],
  ['MNTN (Mountain)', { requests: ['https://dx.mountain.com/spx?dxver=4'] }],
  ['Sojern', { requests: ['https://beacon.sojern.com/pixel/p/1'] }],
  ['Viant Adelphic', { requests: ['https://ad.ipredictive.com/d/track/event?adv=1'] }],
  ['Nextdoor Pixel', { scriptSrc: ['https://ads.nextdoor.com/public/pixel/ndp.js'] }],
  ['HubSpot Cookie Banner', { scriptSrc: ['https://js-eu1.hs-banner.com/v2/123456/banner.js'] }],
  ['Securiti Consent', { scriptSrc: ['https://cdn-prod.securiti.ai/consent/cookie-consent-sdk-loader.js'] }],
  ['Siteimprove Analytics', { scriptSrc: ['https://siteimproveanalytics.com/js/siteanalyze_6000.js'] }],
  ['Branch', { scriptSrc: ['https://cdn.branch.io/branch-latest.min.js'] }],
  ['TVSquared (Innovid)', { cookies: { '_tq_id.TV-123': 'x' } }],
  ['iSpot.tv', { requests: ['https://pt.ispot.tv/v2/TC-1234-1.gif'] }],
  ['Nielsen Digital Measurement (DCR/DAR)', { requests: ['https://secure-de.imrworldwide.com/cgi-bin/m?ci=x'] }],
  // 02 – Signal-Ergänzungen bestehender Regeln
  ['The Trade Desk', { requests: ['https://insight.adsrvr.org/track/up?adv=1'] }],
  ['Twitter / X Pixel', { requests: ['https://analytics.twitter.com/i/adsct?p_id=Twitter'] }],
  ['Yahoo Advertising', { scriptSrc: ['https://s.yimg.com/wi/ytc.js'] }],
  ['TripleLift', { requests: ['https://eb2.3lift.com/xuid?mid=1'] }],
  ['Adobe Dynamic Media', { requests: ['https://images.kunde.com/is/image/kunde/hero-banner?wid=800'] }],
  ['Rakuten Advertising', { scriptSrc: ['https://tag.rmp.rakuten.com/123.ct.js'] }],
  ['Awin', { scriptSrc: ['https://www.dwin1.com/12345.js'] }],
  ['Salesforce Commerce Cloud', { scriptSrc: ['https://cdn.cquotient.com/js/v2/gretel.min.js'] }],
  ['jQuery', { scriptSrc: ['https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.js'] }],
  ['Snapchat Pixel', { cookies: { _scid: 'x' } }],
  // 03 – Martech-Signale
  ['Adobe Marketo Engage', { cookies: { _mkto_trk: 'id:123-ABC-456&token:x' } }],
  ['Adobe Dynamic Media', { html: '<img src="https://cdn.adobe.com/dynamicmedia/assets/urn:aaid:aem:x/as/hero.webp">' }],
  ['Adobe Experience Manager (Edge Delivery Services)', { requests: ['https://main--site--org.aem.live/nav.plain.html'] }],
  ['Sitecore', { requests: ['https://edge.sitecorecloud.io/api/graphql/v1'] }],
  ['Sitecore', { cookies: { boxever_id: 'x' } }],
  ['Salesforce Commerce Cloud', { cookies: { dwsid: 'x' } }],
  ['SAP Commerce Cloud (Hybris)', { html: '<cx-storefront class="cx-storefront stop-navigating"></cx-storefront>' }],
  ['SAP Commerce Cloud (Hybris)', { requests: ['https://api.shop.example.com/occ/v2/electronics/products/search'] }],
  ['Commercetools', { requests: ['https://api.europe-west1.gcp.commercetools.com/acme/graphql'] }],
  ['HubSpot Marketing', { cookies: { hubspotutk: 'x', __hstc: 'y' } }],
  ['Pardot', { cookies: { visitor_id123456: 'x' } }],
  ['Rudderstack', { cookies: { rl_anonymous_id: 'x' } }],
  ['Segment', { requests: ['https://api.segment.io/v1/t'] }],
  ['Segment', { cookies: { ajs_anonymous_id: 'x' } }],
  ['Optimizely', { cookies: { optimizelyEndUserId: 'oeu1700000000000r0.1' } }],
  ['Contentsquare', { cookies: { _cs_c: '1' } }],
  ['Tealium iQ', { cookies: { utag_main: 'v_id:1' } }],
  ['Didomi', { cookies: { didomi_token: 'x' } }],
  ['Sourcepoint', { scriptSrc: ['https://cdn.privacy-mgmt.com/wrapper.min.js'] }],
  ['IAB TCF v2 CMP', { cookies: { 'euconsent-v2': 'CP...' } }],
  ['Server-Side GTM (First-Party Collect)', { requests: ['https://sst.kunde.de/g/collect?v=2&tid=G-ABC123&cid=1.2&en=page_view'] }],
  ['Adobe Experience Platform Web SDK', { requests: ['https://data.kunde.de/ee/v2/interact?configId=abc'] }],
  ['Evergage / Salesforce Interaction Studio', { scriptSrc: ['https://cdn.evgnet.com/beacon/acme/engage/scripts/evergage.min.js'] }],
  // 01 – Konkurrenzprodukte
  ['Salesforce Data Cloud', { scriptSrc: ['https://cdn.c360a.salesforce.com/beacon/c360a/abc/scripts/c360a.min.js'] }],
  ['Oracle Maxymiser', { scriptSrc: ['https://service.maxymiser.net/api/eu/kunde.de/abc/mmapi.js'] }],
  ['IBM Tealeaf', { requests: ['https://www.kunde.de/TealeafTarget.php'] }],
  ['Oracle Infinity', { scriptSrc: ['https://c.oracleinfinity.io/acs/account/abc/js/kunde/odc.js'] }],
  ['Acquia Personalization', { scriptSrc: ['https://lift3assets.lift.acquia.com/stable/lift.js'] }],
  ['Acquia CDP', { scriptSrc: ['https://scripts.agilone.com/latest/a1.js'] }],
  ['Acquia Site Studio', { html: '<link href="/sites/default/files/cohesion/styles/base/x.css">' }],
];

for (const [rule, data] of POSITIVE) {
  test(`neue/erweiterte Regel erkennt: ${rule} (${Object.keys(data).join(', ')})`, () => {
    assert.ok(names(page(data)).includes(rule), rule);
  });
}

test('Server-Side GTM: /g/collect ohne GA4-Kontext oder auf Google-Hosts ist kein sGTM', () => {
  for (const url of [
    'https://www.google-analytics.com/g/collect?v=2&tid=G-ABC',
    'https://region1.analytics.google.com/g/collect?v=2&tid=G-ABC',
    'https://shop.example.com/g/collect',
    'https://shop.example.com/g/collect?tid=UA-1',
    'https://shop.example.com/mp/collect?measurement_id=G-1',
  ]) {
    assert.ok(!names(page({ requests: [url] })).includes('Server-Side GTM (First-Party Collect)'), url);
  }
});

test('Shopify-Stage-Header wird bewusst nicht als Signal genutzt (03-Negativempfehlung)', () => {
  assert.ok(!customDetect(page({ headers: { 'x-shopify-stage': 'production' } })).some((d) => /Shopify/.test(d.name)));
});

// ── Teil 4: Aliasse und ignorierte OP-Tags ───────────────────────────────────
test('OP-Aliasse aus der Gap-Analyse lösen auf unsere Regelnamen auf', () => {
  const idx = techstackIndex();
  const cases: Array<[string, string]> = [
    ['TradeDesk', 'The Trade Desk'],
    ['X Analytics Conversion', 'Twitter / X Pixel'],
    ['Amazon CloudFront CDN', 'AWS CloudFront'],
    ['Yahoo Rapid', 'Yahoo Advertising'],
    ['Snapchat Event Loader JS', 'Snapchat Pixel'],
    ['AEM Dynamic Media', 'Adobe Dynamic Media'],
    ['Google APIs jQuery', 'jQuery'],
    ['Triple Lift', 'TripleLift'],
    ['HubSpot Analytics Loader', 'HubSpot Marketing'],
    ['HubSpot CMP Banner', 'HubSpot Cookie Banner'],
    ['Visual Website Optimizer', 'VWO'],
    ['X Widget', 'Twitter / X Widgets'],
    ['Rakuten Marketing', 'Rakuten Advertising'],
    ['consentmanager CMP', 'Consentmanager.net'],
    ['CQuotient JS', 'Salesforce Commerce Cloud'],
    ['CHEQ Manage', 'Ensighten'],
    ['LiveEngage', 'LivePerson'],
    ['Affiliate Window', 'Awin'],
    ['Datadog Browser Logs', 'Datadog RUM'],
    ['Action IQ', 'ActionIQ'],
    ['NielsenOnline', 'Nielsen Digital Measurement (DCR/DAR)'],
    ['Salesforce Audience Studio', 'Salesforce DMP (Krux)'],
  ];
  for (const [op, ours] of cases) assert.equal(idx.resolveObservePoint(op), canonicalKeyForTechstack(ours), op);
});

test('Alt-Namen zusammengeführter Regeln bleiben vergleichbar', () => {
  for (const [old, now] of [
    ['Insider CDP', 'Insider'],
    ['Mixpanel CDP', 'Mixpanel'],
    ['Coveo Search', 'Coveo'],
    ['Qubit (now Coveo)', 'Qubit'],
    ['Emarsys Personalization', 'Emarsys'],
    ['Lotame Panorama ID', 'Lotame'],
    ['Google Cloud CDN', 'Google Cloud (Load Balancer)'],
    ['Tealium', 'Tealium iQ'],
  ]) {
    assert.equal(canonicalKeyForTechstack(old!), canonicalKeyForTechstack(now!), old);
  }
});

test('Infrastruktur-OP-Tags werden ignoriert', () => {
  for (const t of ['Google Media', 'Google APIs', 'Google Security Scripts', 'ipify API', 'PebblePost', 'Tag Inspector Realtime', 'Everest.js']) {
    assert.ok(isIgnoredOpTag(t), t);
  }
  assert.ok(!isIgnoredOpTag('Google APIs jQuery'));
});

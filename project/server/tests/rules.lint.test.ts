/**
 * Regel-Lint (04-rule-quality.md, Kap. 6a): statische Qualitätsprüfungen über alle DETECTION_RULES.
 * Schlägt fehl, sobald eine neue Regel bekannte Fehltreffer-Muster wieder einführt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DETECTION_RULES } from '../src/services/customDetectors.js';

const KNOWN_CATEGORIES = new Set([
  'Accessibility', 'Advertising', 'Analytics', 'CDN/Infrastructure', 'CDP', 'CMS', 'CRM', 'CRO',
  'CSS Framework', 'Consent Management', 'Customer Support', 'DAM', 'DMP', 'EDW',
  'ESP/Marketing Automation', 'Forms', 'JavaScript Framework', 'Other', 'Payments', 'Performance',
  'Personalization & Optimization', 'Push Notifications', 'Scheduling', 'Search', 'Security',
  'Social', 'Tag Management', 'Video', 'eCommerce',
]);

/** Fremd-URLs aus 04-rule-quality.md, die früher falsche Regeln auslösten; erlaubt = legitime Treffer. */
const COLLISIONS: Array<[string, string[]]> = [
  ['https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js', ['OneSignal']],
  ['https://lpcdn.lpsnmedia.net/le_unified_window/10.0/client.js', ['LivePerson']],
  ['https://cdn.socialmedia.net/js/share.js', []],
  ['https://www.local.com/widget.js', []],
  ['https://www.medical.com/js/app.js', []],
  ['https://www.onshape.com/js/app.js', []],
  ['https://cdn.omniconvert.com/js/a.js', []],
  ['https://cdn.socialimpact.com/x.js', []],
  ['https://vercel.com/_next/static/chunks/turbopack-0mml176l.js', ['Next.js']],
  ['/js/rectangular-slider.js', []],
  ['https://www.example.com/assets/js/member-area.bundle.js', []],
  ['https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js', ['Trustpilot']],
  ['https://www.example.com/js/std.js', []],
  ['https://www.example.com/js/wasp.js', []],
  ['https://www.example.com/_layouts/15/sp.js', []],
  ['/js/remember-me.js', []],
  ['/js/app-bootstrap-loader.js', []],
];

/** Bestand an nackten Produktwort-HTML-Regeln, die bewusst bleiben (eindeutige Embed-Tokens). */
const BARE_WORD_BASELINE = new Set([
  'JotForm:/jotform/', 'JW Player:/jwplayer/', 'Netlify CMS / Decap CMS:/decapcms/',
  'Gravity Forms:/gravityforms/', 'WPForms:/wpforms/',
]);

test('Lint: Regelnamen sind eindeutig', () => {
  const seen = new Set<string>();
  const dups = DETECTION_RULES.map((r) => r.name).filter((n) => (seen.has(n) ? true : (seen.add(n), false)));
  assert.deepEqual(dups, []);
});

test('Lint: keine doppelten Patterns innerhalb einer Regel', () => {
  const bad: string[] = [];
  for (const r of DETECTION_RULES) {
    for (const f of ['html', 'scriptSrc', 'requests', 'edge'] as const) {
      const a = (r.patterns[f] ?? []).map(String);
      if (a.length !== new Set(a).size) bad.push(`${r.name}.${f}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('Lint: jede Kategorie ist bekannt, jede Regel hat mindestens ein Pattern', () => {
  for (const r of DETECTION_RULES) {
    assert.ok(r.categories.length > 0, r.name);
    for (const c of r.categories) assert.ok(KNOWN_CATEGORIES.has(c), `${r.name}: ${c}`);
    assert.ok(Object.values(r.patterns).some((p) => p && Object.keys(p).length > 0), `${r.name}: leer`);
  }
});

test('Lint: Kollisions-URLs lösen nur erlaubte Regeln aus', () => {
  for (const [url, allowed] of COLLISIONS) {
    const hits = DETECTION_RULES.filter((r) =>
      [...(r.patterns.scriptSrc ?? []), ...(r.patterns.requests ?? [])].some((re) => re.test(url)),
    ).map((r) => r.name);
    assert.deepEqual(hits.filter((h) => !allowed.includes(h)), [], url);
  }
});

test('Lint: keine nackten Produktwort-HTML-Regeln außerhalb der Baseline', () => {
  const bad: string[] = [];
  for (const r of DETECTION_RULES) {
    const compact = r.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const re of r.patterns.html ?? []) {
      const src = re.source.toLowerCase();
      if (!/^[a-z0-9]+$/.test(src)) continue;
      if (compact.includes(src) && !BARE_WORD_BASELINE.has(`${r.name}:${String(re)}`)) bad.push(`${r.name}:${String(re)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('Lint: Cookie-Präfixe sind strikt (Trennzeichen am Ende) oder exakte Namen', () => {
  for (const r of DETECTION_RULES) {
    for (const c of r.patterns.cookies ?? []) {
      if (typeof c !== 'string') continue;
      assert.ok(c.length >= 3, `${r.name}: Cookie „${c}“ zu kurz/generisch`);
    }
  }
});

test('Lint: maxConfidence liegt im gültigen Bereich', () => {
  for (const r of DETECTION_RULES) {
    if (r.maxConfidence === undefined) continue;
    assert.ok(r.maxConfidence >= 40 && r.maxConfidence <= 95, `${r.name}: ${r.maxConfidence}`);
  }
});

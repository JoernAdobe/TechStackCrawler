import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { briefingAssetsPath, escapeHtml, renderBriefingHtml } from '../src/services/briefing/render.js';
import { validateBriefingHtml } from '../src/services/briefing/validate.js';
import { BRIEFING_CREDIT } from '../src/types/briefing.js';
import { FIXTURE_SECTIONS, XSS, buildBriefingFixture } from './fixtures/briefingFixture.js';

const TMP = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp-briefing-render');
mkdirSync(TMP, { recursive: true });
process.env.BRIEFING_TMP_DIR = TMP;
after(() => rmSync(TMP, { recursive: true, force: true }));

const html = renderBriefingHtml(buildBriefingFixture());

test('escapeHtml escapes all HTML-relevant characters', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('renderer: untrusted text is escaped, no script injection', () => {
  assert.ok(!html.includes(XSS), 'raw <script> payload must not appear');
  assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'));
  assert.ok(!/javascript:/i.test(html), 'unsafe legend colour must be dropped');
});

test('renderer: self-contained, styles.css verbatim, no external resources', () => {
  const css = readFileSync(briefingAssetsPath('design', 'styles.css'), 'utf8');
  assert.ok(html.includes(css.trim()), 'styles.css must be injected verbatim');
  assert.ok(!/<link\b/i.test(html));
  assert.ok(!/\bsrc=["']https?:/i.test(html));
  assert.match(html, /<!-- client-domains: [^>]*northwind-rockets\.example/);
});

test('renderer: only selected sections, in order, with separators and sources last', () => {
  const ids = [...html.matchAll(/<div class="section" id="(s\d\d)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, FIXTURE_SECTIONS);
  assert.equal((html.match(/<!-- Section: /g) ?? []).length, FIXTURE_SECTIONS.length);
  assert.ok(!html.includes('href="#s05"'), 'deselected sections must not be linked');
  assert.ok(!html.includes('id="s05"'));
  assert.match(html, /\((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}(, snippet only)?\)/);
});

test('renderer: executive summary before s01 and credit footer', () => {
  const exec = html.indexOf('id="executive-summary"');
  assert.ok(exec > 0 && exec < html.indexOf('id="s01"'));
  assert.ok(html.includes('The score is a prioritisation aid, not a forecast.'));
  assert.ok(html.includes('not assessed'));
  assert.match(html, />72</);
  assert.ok(html.includes(`<p>${BRIEFING_CREDIT}</p>`));
  assert.ok(html.includes('Prepared by Adobe Account Intelligence'));
});

test('renderer: score n/a when overallScore is null', () => {
  const fx = buildBriefingFixture();
  const out = renderBriefingHtml({ ...fx, executive: { ...fx.executive, overallScore: null } });
  assert.ok(out.includes('n/a'));
});

test('validator (real python): rendered fixture passes validate-briefing.py', async () => {
  const v = await validateBriefingHtml(html, FIXTURE_SECTIONS);
  if (v.warnings.some((w) => w.startsWith('validator unavailable'))) {
    assert.fail(`python validator not runnable: ${v.warnings.join('; ')}`);
  }
  assert.deepEqual(v.errors, []);
  assert.equal(v.ok, true);
});

test('validator (real python): still reports real errors', async () => {
  const broken = html.replace('Headquarters', '[COMPANY NAME]');
  const v = await validateBriefingHtml(broken, FIXTURE_SECTIONS);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('[COMPANY NAME]')));
  const missing = await validateBriefingHtml(html, [...FIXTURE_SECTIONS, 's13']);
  assert.equal(missing.ok, false);
});

test('validator: python unavailable → ok with warning', async () => {
  const prev = process.env.SCRAPLING_PYTHON_PATH;
  process.env.SCRAPLING_PYTHON_PATH = path.join(TMP, 'no-such-python');
  try {
    const v = await validateBriefingHtml(html, FIXTURE_SECTIONS);
    assert.equal(v.ok, true);
    assert.ok(v.warnings[0].startsWith('validator unavailable'));
  } finally {
    if (prev === undefined) delete process.env.SCRAPLING_PYTHON_PATH;
    else process.env.SCRAPLING_PYTHON_PATH = prev;
  }
});

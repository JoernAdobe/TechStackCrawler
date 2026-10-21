import assert from 'node:assert/strict';
import test from 'node:test';
import { htmlToPdf, PRINT_CSS, resolveChromium, withPrintStyles } from '../src/services/briefing/pdf.js';
import { renderBriefingHtml } from '../src/services/briefing/render.js';
import { briefingFilename } from '../src/routes/briefing.js';
import { buildBriefingFixture } from './fixtures/briefingFixture.js';

test('withPrintStyles injects print CSS before </head>', () => {
  const out = withPrintStyles('<html><head><title>x</title></head><body></body></html>');
  assert.ok(out.includes(`${PRINT_CSS}\n</head>`));
  assert.ok(PRINT_CSS.includes('#navBtn'));
});

test('withPrintStyles handles documents without a head', () => {
  assert.ok(withPrintStyles('<p>x</p>').startsWith(PRINT_CSS));
});

test('PDF filename derives from the HTML filename', () => {
  assert.equal(briefingFilename('Diario AS', 7).replace(/\.html$/, '.pdf'), 'diario-as-client-pre-briefing.pdf');
});

test('htmlToPdf renders a real briefing to PDF when Chromium is available', { skip: !resolveChromium() && 'no Chromium on this machine', timeout: 120_000 }, async () => {
  const pdf = await htmlToPdf(renderBriefingHtml(buildBriefingFixture()));
  assert.equal(pdf.subarray(0, 4).toString('latin1'), '%PDF');
  assert.ok(pdf.length > 10_000);
});

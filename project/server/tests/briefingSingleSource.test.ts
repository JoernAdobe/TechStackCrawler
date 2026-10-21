import assert from 'node:assert/strict';
import test from 'node:test';
import { measuredBlock, scanSource, techFactsFor, withMeasuredBlock } from '../src/services/briefing/context.js';
import { buildSystemPrompt } from '../src/services/briefing/sections/prompts.js';
import { loadBriefingAssets } from '../src/services/briefing/assets.js';
import type { AnalysisResult } from '../src/types/analysis.js';
import type { BriefingSection } from '../src/types/briefing.js';

function analysis(): AnalysisResult {
  return {
    url: 'https://www.example.com/',
    analyzedAt: '2026-05-01T00:00:00Z',
    summary: '',
    categories: [],
    rawDetections: [
      { name: 'Adobe Experience Manager', categories: ['CMS'], confidence: 100 },
      { name: 'Google Analytics', categories: ['Analytics'], confidence: 100 },
      { name: 'Meta Pixel', categories: ['Advertising'], confidence: 100 },
      { name: 'Google Ads', categories: ['Advertising'], confidence: 100 },
    ],
    enrichments: {
      traffic: {
        semrush: { visits: 2_500_000, organicTraffic: 900_000, organicKeywords: 40_000, paidTraffic: 120_000, topCountries: [{ country: 'DE', sharePct: 88 }] },
      },
      geo: {
        model: 'claude', country: 'DE', geoScore: 41, aiVisibility: 33, shareOfVoicePct: 12, marketPosition: 'Challenger',
        competitors: [{ name: 'Allianz', visibilityPct: 45 }],
      },
      lighthouse: { mobile: { scores: { performance: 52, seo: 92, accessibility: 88 }, vitals: { lcpMs: 3400 }, opportunities: [] } },
    },
  } as unknown as AnalysisResult;
}

test('s04 KPI strip is computed from the scan (same numbers as the Tech Stack tab)', () => {
  const block = measuredBlock('s04', analysis());
  assert.equal(block?.type, 'feature-grid');
  const cards = block!.type === 'feature-grid' ? block!.cards : [];
  assert.ok(cards.length === 2 || cards.length === 4);
  assert.equal(cards[0].label, 'Verified technologies');
  assert.equal(cards[0].value, '4');
});

test('s07 KPI strip uses GEO, Semrush and Lighthouse values', () => {
  const block = measuredBlock('s07', analysis());
  const cards = block?.type === 'feature-grid' ? block.cards : [];
  assert.equal(cards.length, 4);
  assert.deepEqual(cards.map((c) => c.value), ['41/100', '2.5M', '92/100', '52/100']);
});

test('withMeasuredBlock inserts the strip after the intro and cites the scan once', () => {
  const a = analysis();
  const section: BriefingSection = {
    id: 's07', title: 'SEO & Search Visibility', eyebrow: 'Search & Discovery', status: 'done',
    blocks: [{ type: 'paragraph', text: 'Intro.' }, { type: 'note', text: 'Strategy.' }],
    sources: [], gaps: [],
  };
  const out = withMeasuredBlock(section, a, scanSource(a));
  assert.deepEqual(out.blocks.map((b) => b.type), ['paragraph', 'feature-grid', 'note']);
  assert.equal(out.sources.length, 1);
  const again = withMeasuredBlock({ ...section, sources: out.sources }, a, scanSource(a));
  assert.equal(again.sources.length, 1);
  const other = withMeasuredBlock({ ...section, id: 's01' }, a, scanSource(a));
  assert.equal(other.blocks.length, 2);
});

test('marketing, social, competitive and market sections get the matching scan facts', () => {
  const a = analysis();
  assert.match(techFactsFor('s05', a), /Google Ads/);
  assert.match(techFactsFor('s05', a), /paid search traffic/);
  assert.match(techFactsFor('s06', a), /Meta Pixel/);
  assert.match(techFactsFor('s09', a), /Allianz: 45%/);
  assert.match(techFactsFor('s10', a), /DE 88%/);
  assert.equal(techFactsFor('s01', a), '');
});

test("measured sections forbid researched metrics in the prompt", () => {
  const assets = loadBriefingAssets();
  assert.match(buildSystemPrompt(assets, 's07'), /Single source of truth/);
  assert.match(buildSystemPrompt(assets, 's04'), /come ONLY from the analyzer facts/);
  assert.doesNotMatch(buildSystemPrompt(assets, 's01'), /Single source of truth/);
});

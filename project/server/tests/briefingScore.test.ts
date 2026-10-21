import assert from 'node:assert/strict';
import test from 'node:test';
import {
  confidenceOf,
  maturityScore,
  measuredSubScores,
  overallScore,
  ratedApplicable,
  ratedValue,
  reachScore,
  RUBRICS,
  scoreBand,
  whitespaceScore,
} from '../src/services/briefing/executive.js';
import { fallbackNarrative, playsFromS14 } from '../src/services/briefing/executiveLlm.js';
import type { AnalysisResult } from '../src/types/analysis.js';
import { SUB_SCORE_WEIGHTS, type BriefingSection, type BriefingSectionId, type SubScore, type SubScoreKey } from '../src/types/briefing.js';

function analysis(over: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    url: 'https://www.example.com/',
    analyzedAt: '2026-05-01T00:00:00Z',
    summary: '',
    categories: [],
    rawDetections: [
      { name: 'Adobe Experience Manager', categories: ['CMS'], confidence: 100 },
      { name: 'Google Analytics', categories: ['Analytics'], confidence: 100 },
      { name: 'Google Tag Manager', categories: ['Tag Management'], confidence: 100 },
      { name: 'OneTrust', categories: ['Consent Management'], confidence: 100 },
      { name: 'Optimizely', categories: ['Personalization & Optimization'], confidence: 100, weak: true },
    ],
    ...over,
  } as AnalysisResult;
}

const sub = (key: SubScoreKey, value: number | null): SubScore => ({ key, label: key, weight: SUB_SCORE_WEIGHTS[key], value, kind: 'measured', rationale: '', sectionRefs: [] });
const section = (id: BriefingSectionId, status: BriefingSection['status'], extra: Partial<BriefingSection> = {}): BriefingSection => ({
  id,
  title: id,
  eyebrow: '',
  status,
  blocks: [],
  sources: [],
  gaps: [],
  ...extra,
});

test('whitespace: Adobe present lowers, competitors/empty blocks raise; weak detections ignored', () => {
  const ws = whitespaceScore(analysis());
  assert.ok(ws.value !== null && ws.value > 0 && ws.value < 100);
  assert.match(ws.rationale, /Google Analytics/);
  assert.match(ws.rationale, /Adobe already present in CMS/);
  assert.doesNotMatch(ws.rationale, /Optimizely/);
  const allAdobe = whitespaceScore(analysis({ rawDetections: [{ name: 'Adobe Analytics', categories: ['Analytics'], confidence: 100 }] }));
  const noAdobe = whitespaceScore(analysis({ rawDetections: [{ name: 'Google Analytics', categories: ['Analytics'], confidence: 100 }] }));
  assert.ok(noAdobe.value! > allAdobe.value!);
  assert.equal(whitespaceScore(analysis({ rawDetections: [] })).value, null);
});

test('maturity: breadth + basics + lighthouse + GEO; null without data', () => {
  const base = maturityScore(analysis());
  // 4 strong techs → 16; analytics+TMS+consent → 100
  assert.equal(base.value, Math.round((16 + 100) / 2));
  const withLh = maturityScore(
    analysis({
      enrichments: {
        lighthouse: { mobile: { scores: { performance: 40 } }, desktop: { scores: { performance: 80 } } },
        geo: { geoScore: 70 },
      } as unknown as AnalysisResult['enrichments'],
    }),
  );
  assert.equal(withLh.value, Math.round((16 + 100 + 60 + 70) / 4));
  assert.equal(maturityScore(analysis({ rawDetections: [] })).value, null);
});

test('reach: reuses traffic score (Tranco/Semrush) + market breadth', () => {
  assert.equal(reachScore(analysis()).value, null);
  const r = reachScore(
    analysis({
      enrichments: {
        traffic: { sources: ['tranco'], trancoRank: 1000, semrush: { visits: 10_000_000, topCountries: [{ country: 'DE', sharePct: 50 }, { country: 'US', sharePct: 20 }, { country: 'FR', sharePct: 1 }] } },
      } as unknown as AnalysisResult['enrichments'],
    }),
  );
  // traffic score = max(100·(1−3/6), 100·(7−3)/6) = 67; 2 countries ≥3 % → 40
  assert.equal(r.value, Math.round(0.85 * 67 + 0.15 * 40));
});

test('rated value from rubric level', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(ratedValue), [0, 25, 50, 75, 100]);
  assert.equal(ratedValue(0), null);
  assert.equal(ratedValue(6), null);
  assert.equal(ratedValue(undefined), null);
  assert.equal(RUBRICS.momentum.length, 5);
  assert.equal(RUBRICS.urgency.length, 5);
});

test('rated applicability needs a done section of the rubric', () => {
  assert.equal(ratedApplicable('momentum', [section('s03', 'thin'), section('s13', 'error')]), false);
  assert.equal(ratedApplicable('momentum', [section('s03', 'done')]), true);
  assert.equal(ratedApplicable('urgency', [section('s03', 'done')]), false);
  assert.equal(ratedApplicable('urgency', [section('s11', 'done')]), true);
});

test('overall: weighted mean with renormalised weights, null below 50 % assessed weight', () => {
  const all = [sub('whitespace', 80), sub('maturity', 40), sub('reach', 60), sub('momentum', 50), sub('urgency', 100)];
  assert.equal(overallScore(all), Math.round(0.3 * 80 + 0.15 * 40 + 0.15 * 60 + 0.2 * 50 + 0.2 * 100));
  const partial = [sub('whitespace', 80), sub('maturity', 40), sub('reach', null), sub('momentum', 50), sub('urgency', null)];
  assert.equal(overallScore(partial), Math.round((0.3 * 80 + 0.15 * 40 + 0.2 * 50) / 0.65));
  const tooLittle = [sub('whitespace', 80), sub('maturity', null), sub('reach', 60), sub('momentum', null), sub('urgency', null)];
  assert.equal(overallScore(tooLittle), null);
  assert.equal(scoreBand(70), 'high');
  assert.equal(scoreBand(69), 'medium');
  assert.equal(scoreBand(40), 'medium');
  assert.equal(scoreBand(39), 'low');
  assert.equal(scoreBand(null), 'low');
});

test('confidence from assessed weight and done share', () => {
  const all = [sub('whitespace', 1), sub('maturity', 1), sub('reach', 1), sub('momentum', 1), sub('urgency', 1)];
  const done = [section('s01', 'done'), section('s14', 'done')];
  assert.equal(confidenceOf(all, done), 'high');
  assert.equal(confidenceOf(all, [section('s01', 'done'), section('s14', 'thin')]), 'medium');
  const half = [sub('whitespace', 1), sub('maturity', 1), sub('reach', 1), sub('momentum', null), sub('urgency', null)];
  assert.equal(confidenceOf(half, [section('s01', 'thin'), section('s14', 'error')]), 'low');
});

test('measured sub-scores carry weights and section refs', () => {
  const subs = measuredSubScores(analysis());
  assert.deepEqual(subs.map((s) => s.key), ['whitespace', 'maturity', 'reach']);
  assert.ok(subs.every((s) => s.kind === 'measured' && s.weight === SUB_SCORE_WEIGHTS[s.key]));
});

test('fallback narrative and plays from s14 steps', () => {
  const s14 = section('s14', 'done', {
    blocks: [
      {
        type: 'steps',
        items: [
          { title: '1. Adobe Real-Time CDP for unified profiles.', body: 'Fragmented first-party data across brands.' },
          { title: '2. Adobe Journey Optimizer for triggered journeys.', body: 'Batch e-mail only today.' },
        ],
      },
    ],
  } as Partial<BriefingSection>);
  const plays = playsFromS14([s14]);
  assert.ok(plays.length >= 1);
  assert.ok(plays.every((p) => p.sectionRef === 's14' && p.basedOn));
  const fb = fallbackNarrative('Example', [s14], 55, 'Scan: …');
  assert.equal(fb.bullets.length, 5);
  assert.ok(fb.verdict.includes('Example'));
});

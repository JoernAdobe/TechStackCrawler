import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAliases,
  classifySentiment,
  computeScores,
  countryFromTld,
  dedupeQueries,
  domainStem,
  fallbackRecommendations,
  funnelDistribution,
  jaccard,
  marketPosition,
  matchMentions,
  stripLegalForm,
  tokenize,
  type ScoredQueryInput,
} from '../src/services/geoScoreMath.js';

test('funnelDistribution: 15/20/Rest/15 und Summe = n', () => {
  assert.deepEqual(funnelDistribution(20), { Awareness: 3, Interest: 4, Consideration: 10, Purchase: 3 });
  assert.deepEqual(funnelDistribution(8), { Awareness: 1, Interest: 2, Consideration: 4, Purchase: 1 });
  for (const n of [8, 13, 20, 27, 40]) {
    const d = funnelDistribution(n);
    assert.equal(d.Awareness + d.Interest + d.Consideration + d.Purchase, n);
    assert.ok(Object.values(d).every((v) => v >= 1));
  }
});

test('jaccard + dedupeQueries entfernen Beinahe-Duplikate (Schwelle 0.7)', () => {
  assert.equal(jaccard(tokenize('best running shoes'), tokenize('the best running shoes')), 1);
  assert.equal(jaccard(new Set(), new Set()), 1);
  const out = dedupeQueries([
    { query: 'Best running shoes for beginners' },
    { query: 'What are the best running shoes for beginners?' },
    { query: 'Where to buy running shoes online cheaply' },
  ]);
  assert.deepEqual(out.map((q) => q.query), ['Best running shoes for beginners', 'Where to buy running shoes online cheaply']);
});

test('Aliase: Domain-Stem und Name ohne Rechtsform', () => {
  assert.equal(domainStem('https://www.shop.bmw.co.uk/path'), 'bmw');
  assert.equal(domainStem('deutsche-bank.de'), 'deutsche-bank');
  assert.equal(stripLegalForm('Muster GmbH & Co. KG'), 'Muster');
  const aliases = buildAliases('Deutsche Bank AG', 'https://www.deutsche-bank.de');
  assert.ok(aliases.includes('Deutsche Bank AG'));
  assert.ok(aliases.includes('Deutsche Bank'));
  assert.ok(aliases.includes('deutsche-bank'));
});

test('matchMentions: case-insensitive, Wortgrenzen, Position, Excerpt', () => {
  const text = 'Top picks: Nike and adidas. NIKE is popular; Nikelab is a sub-brand.';
  const m = matchMentions(text, ['Nike']);
  assert.equal(m.mentioned, true);
  assert.equal(m.occurrences, 2);
  assert.equal(m.firstOffset, text.indexOf('Nike'));
  assert.equal(m.firstPosition, text.indexOf('Nike') / text.length);
  assert.ok(m.excerpt?.includes('Nike'));
  assert.equal(matchMentions('Nikelab only', ['Nike']).mentioned, false);
  assert.equal(matchMentions('Grüße von Müller-Bank', ['Müller']).mentioned, true);
  const long = `${'x '.repeat(200)}Brand ${'y '.repeat(200)}`;
  const ex = matchMentions(long, ['Brand']).excerpt!;
  assert.ok(ex.startsWith('…') && ex.endsWith('…') && ex.length <= 205);
});

test('Sentiment lexikonbasiert mit Schwelle ±0.05', () => {
  assert.equal(classifySentiment('Acme is a trusted and popular choice'), 'Positive');
  assert.equal(classifySentiment('Acme is expensive and has many complaints'), 'Negative');
  assert.equal(classifySentiment('Acme sells shoes'), 'Neutral');
  assert.equal(classifySentiment('Acme is not reliable'), 'Negative');
});

test('marketPosition aus Positionsscore', () => {
  assert.deepEqual(marketPosition(0, 0), { label: 'Competitive', score: 50 });
  assert.equal(marketPosition(90, 10).label, 'Market Leader');
  assert.equal(marketPosition(70, 30).label, 'Strong Position');
  assert.equal(marketPosition(50, 50).label, 'Competitive');
  assert.equal(marketPosition(10, 90).label, 'Challenged');
});

test('countryFromTld', () => {
  assert.equal(countryFromTld('https://www.example.de'), 'DE');
  assert.equal(countryFromTld('shop.example.co.uk'), 'GB');
  assert.equal(countryFromTld('example.com'), null);
});

function q(stage: ScoredQueryInput['stage'], mentioned: boolean, comps: string[] = [], firstPosition = 0): ScoredQueryInput {
  return {
    stage,
    success: true,
    responseLength: 1000,
    brand: mentioned
      ? { mentioned: true, occurrences: 2, firstOffset: firstPosition * 1000, firstPosition }
      : { mentioned: false, occurrences: 0, firstOffset: -1 },
    sentiment: mentioned ? 'Positive' : undefined,
    competitorsMentioned: comps,
  };
}

test('computeScores: Formeln MF/PP/QC/AIV/Gap/SoV/GEO', () => {
  const s = computeScores(
    [
      q('Awareness', true, ['X'], 0),
      q('Interest', true, [], 0.5),
      q('Consideration', false, ['X', 'Y']),
      q('Purchase', false, ['X']),
      { ...q('Purchase', true), success: false },
    ],
    ['X', 'Y'],
  );
  // base_rate = 2/4·100 = 50; density = 2/1 = 2 → 40; MF = 40 + 8 = 48
  assert.equal(s.components.mentionFrequency, 48);
  // PP = mean(100, 50) = 75
  assert.equal(s.components.prominence, 75);
  // coverage = 2/4; avgStageRate = (1+1+0+0)/4 = 0.5 → QC = 50
  assert.equal(s.components.queryCoverage, 50);
  // AIV = 24 + 22.5 + 10 = 56.5
  assert.equal(s.aiVisibility, 56.5);
  // Gap = 2/3·100
  assert.equal(s.components.competitorGap, 66.7);
  // SoV = 2/(2+3+1)
  assert.equal(s.shareOfVoicePct, 33.3);
  assert.equal(s.geoScore, Math.round((56.5 * 2 / 3 + (200 / 3) / 3) * 10) / 10);
  assert.equal(s.components.sentiment, 100);
  // bv=50, cv=75 → score 40, Konkurrenzanteil 60 → Competitive
  assert.equal(s.marketPosition, 'Competitive');
  assert.equal(s.successful, 4);
  assert.deepEqual(s.competitors.map((c) => c.mentions), [3, 1]);
  assert.equal(s.funnel.find((f) => f.stage === 'Purchase')?.queries, 1);
});

test('computeScores: Edge Cases ohne Konkurrenten / ohne Erwähnung', () => {
  const none = computeScores([q('Awareness', false)], []);
  assert.equal(none.components.competitorGap, 50);
  assert.equal(none.aiVisibility, 0);
  assert.equal(none.shareOfVoicePct, 0);
  assert.equal(none.components.sentiment, 50);
  const lead = computeScores([q('Awareness', true)], ['X']);
  assert.equal(lead.components.competitorGap, 100);
  assert.equal(lead.marketPosition, 'Market Leader');
  const recs = fallbackRecommendations('Acme', none);
  assert.ok(recs.length >= 1 && recs.length <= 6);
});

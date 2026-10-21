/**
 * Executive Summary – deterministische Bewertung (rein, unit-getestet).
 * Gemessene Sub-Scores aus der Analyse, Rubrik für die vom LLM eingestuften Scores,
 * Gesamtwert als renormalisiertes gewichtetes Mittel; das LLM setzt den Gesamtwert nie.
 */
import type { AnalysisResult } from '../../types/analysis.js';
import {
  SUB_SCORE_WEIGHTS,
  type BriefingSection,
  type BriefingSectionId,
  type Confidence,
  type ScoreBand,
  type SubScore,
  type SubScoreKey,
} from '../../types/briefing.js';
import { BLOCK_PRODUCT, trafficScore } from '../accountView.js';
import { consentTechnologies, techFootprint } from './context.js';

export const SUB_SCORE_LABELS: Record<SubScoreKey, string> = {
  whitespace: 'Adobe whitespace',
  maturity: 'Digital maturity',
  reach: 'Digital reach',
  momentum: 'Business momentum',
  urgency: 'Urgency / triggers',
};

/** Lückenfaktor, wenn in einem Block nichts erkannt wurde (wie accountView.ts NONE_DETECTED_FACTOR). */
const NONE_DETECTED_FACTOR: Record<string, number> = {
  Analytics: 0.6,
  'Tag Management': 0.5,
  'Personalization & Optimization': 0.5,
  CMS: 0.3,
  CDP: 0.25,
  'Campaign Orchestration': 0.25,
};

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export interface MeasuredScore {
  value: number | null;
  rationale: string;
}

/** Adobe-Whitespace: je Building Block mit Adobe-Angebot 0 (Adobe da), 1 (Wettbewerber), 1,25 (fragmentiert) bzw. Lückenfaktor (nichts erkannt). */
export function whitespaceScore(analysis: AnalysisResult): MeasuredScore {
  if (!(analysis.rawDetections ?? []).some((d) => !d.weak)) return { value: null, rationale: 'No verified technology detections in the scan.' };
  const fp = techFootprint(analysis);
  const gaps: number[] = [];
  const competitorBlocks: string[] = [];
  const adobeBlocks: string[] = [];
  const emptyBlocks: string[] = [];
  for (const block of Object.keys(BLOCK_PRODUCT)) {
    const f = fp.get(block);
    if (f?.adobe.length) {
      gaps.push(0);
      adobeBlocks.push(block);
    } else if (f?.competitors.length) {
      gaps.push(f.competitors.length >= 2 ? 1.25 : 1);
      competitorBlocks.push(`${block} (${f.competitors.slice(0, 2).join(', ')})`);
    } else if (NONE_DETECTED_FACTOR[block] !== undefined) {
      gaps.push(NONE_DETECTED_FACTOR[block]);
      emptyBlocks.push(block);
    }
  }
  const value = Math.round(clamp((100 * gaps.reduce((a, b) => a + b, 0)) / gaps.length));
  const parts = [
    competitorBlocks.length ? `non-Adobe solutions in ${competitorBlocks.join('; ')}` : '',
    emptyBlocks.length ? `nothing detected in ${emptyBlocks.join(', ')}` : '',
    adobeBlocks.length ? `Adobe already present in ${adobeBlocks.join(', ')}` : 'no Adobe solution detected',
  ].filter(Boolean);
  return { value, rationale: `Scan: ${parts.join('; ')}.` };
}

/** Digitale Reife: Breite des Stacks, Lighthouse-Performance, GEO-Score, Grundausstattung (Analytics, Tag Management, Consent). */
export function maturityScore(analysis: AnalysisResult): MeasuredScore {
  const strong = (analysis.rawDetections ?? []).filter((d) => !d.weak);
  const parts: string[] = [];
  const scores: number[] = [];
  if (strong.length) {
    scores.push(clamp((strong.length / 25) * 100));
    parts.push(`${strong.length} verified technologies`);
    const fp = techFootprint(analysis);
    const has = (b: string) => Boolean(fp.get(b)?.adobe.length || fp.get(b)?.competitors.length);
    const consent = consentTechnologies(analysis).length > 0;
    scores.push((has('Analytics') ? 50 : 0) + (has('Tag Management') ? 25 : 0) + (consent ? 25 : 0));
    parts.push(`analytics ${has('Analytics') ? 'yes' : 'no'}, tag management ${has('Tag Management') ? 'yes' : 'no'}, consent ${consent ? 'yes' : 'no'}`);
  }
  const lh = analysis.enrichments?.lighthouse;
  const perf = [lh?.mobile?.scores.performance, lh?.desktop?.scores.performance].filter((v): v is number => typeof v === 'number');
  if (perf.length) {
    scores.push(mean(perf));
    parts.push(`Lighthouse performance ${Math.round(mean(perf))}`);
  }
  const geo = analysis.enrichments?.geo?.geoScore;
  if (typeof geo === 'number') {
    scores.push(clamp(geo));
    parts.push(`GEO score ${Math.round(geo)}`);
  }
  if (!scores.length) return { value: null, rationale: 'No scan, Lighthouse or GEO data available.' };
  return { value: Math.round(mean(scores)), rationale: `Measured: ${parts.join('; ')}.` };
}

/** Digitale Reichweite: Traffic-Score (Tranco/Semrush, wie Account View) plus Marktbreite (Top-Länder ≥ 3 %). */
export function reachScore(analysis: AnalysisResult): MeasuredScore {
  const t = analysis.enrichments?.traffic;
  const traffic = trafficScore(t ? { sources: t.sources, trancoRank: t.trancoRank, visits: t.semrush?.visits } : undefined);
  if (traffic === null) return { value: null, rationale: 'No traffic data (Tranco/Semrush) in the analysis.' };
  const countries = (t?.semrush?.topCountries ?? []).filter((c) => c.sharePct >= 3).length;
  const parts = [`traffic score ${traffic}${t?.trancoRank ? ` (Tranco rank ${t.trancoRank})` : ''}${t?.semrush?.visits ? `, ${Math.round(t.semrush.visits).toLocaleString('en-US')} monthly visits` : ''}`];
  if (!countries) return { value: traffic, rationale: `Measured: ${parts.join('; ')}.` };
  parts.push(`${countries} countries with ≥3% traffic share`);
  return { value: Math.round(0.85 * traffic + 0.15 * clamp(countries * 20)), rationale: `Measured: ${parts.join('; ')}.` };
}

// ── Rubriken (LLM stuft ein, Wert = (Stufe − 1) · 25) ─────────────────────

export type RatedKey = 'momentum' | 'urgency';

export const RATED_SECTIONS: Record<RatedKey, BriefingSectionId[]> = {
  momentum: ['s03', 's13'],
  urgency: ['s04', 's11', 's12', 's13'],
};

export const RUBRICS: Record<RatedKey, string[]> = {
  momentum: [
    'Declining: falling revenue or profit, restructuring, layoffs or cost-cutting; no visible investment.',
    'Flat / defensive: stagnant results, cost focus, investments paused or postponed.',
    'Stable: modest growth and steady business-as-usual investment, no major new programmes.',
    'Growing: clear revenue growth or announced strategic / digital investment programmes.',
    'Strong momentum: strong growth plus major announced transformation, expansion or M&A with dedicated budget.',
  ],
  urgency: [
    'No trigger: modern, consolidated stack; no leadership, regulatory or strategic trigger visible.',
    'Weak triggers: minor gaps, nothing time-bound.',
    'Moderate: clear gaps (fragmented or outdated stack, consent / compliance weaknesses) or a strategy refresh, without a deadline.',
    'High: a concrete trigger within ~12 months (new CMO/CDO/CIO, re-platforming, regulatory deadline, contract renewal, competitive pressure).',
    'Acute: several concrete triggers with near-term deadlines, or a publicly announced re-platforming / tender.',
  ],
};

export function rubricText(key: RatedKey): string {
  return RUBRICS[key].map((r, i) => `${i + 1} = ${r}`).join('\n');
}

export function ratedValue(level: number | null | undefined): number | null {
  if (typeof level !== 'number' || !Number.isFinite(level)) return null;
  const l = Math.round(level);
  return l >= 1 && l <= 5 ? (l - 1) * 25 : null;
}

/** Rated Score nur bewertbar, wenn mindestens ein zugehöriger Abschnitt gewählt und „done“ ist. */
export function ratedApplicable(key: RatedKey, sections: BriefingSection[]): boolean {
  return sections.some((s) => RATED_SECTIONS[key].includes(s.id) && s.status === 'done');
}

// ── Gesamtwert ────────────────────────────────────────────────────────────

export function assessedWeight(subScores: SubScore[]): number {
  return subScores.filter((s) => s.value !== null).reduce((a, s) => a + s.weight, 0);
}

export function overallScore(subScores: SubScore[]): number | null {
  const assessed = subScores.filter((s): s is SubScore & { value: number } => s.value !== null);
  const w = assessed.reduce((a, s) => a + s.weight, 0);
  const total = subScores.reduce((a, s) => a + s.weight, 0) || 1;
  if (!assessed.length || w / total < 0.5) return null;
  return Math.round(assessed.reduce((a, s) => a + s.value * s.weight, 0) / w);
}

export function scoreBand(score: number | null): ScoreBand {
  if (score === null) return 'low';
  return score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
}

/** Aus bewertetem Gewichtsanteil und Anteil vollständig recherchierter Abschnitte. */
export function confidenceOf(subScores: SubScore[], sections: BriefingSection[]): Confidence {
  const total = subScores.reduce((a, s) => a + s.weight, 0) || 1;
  const assessedShare = assessedWeight(subScores) / total;
  const considered = sections.filter((s) => s.status !== 'skipped');
  const doneShare = considered.length ? considered.filter((s) => s.status === 'done').length / considered.length : 0;
  const c = 0.5 * assessedShare + 0.5 * doneShare;
  return c >= 0.8 ? 'high' : c >= 0.55 ? 'medium' : 'low';
}

export function measuredSubScores(analysis: AnalysisResult): SubScore[] {
  const make = (key: SubScoreKey, m: MeasuredScore, sectionRefs: BriefingSectionId[]): SubScore => ({
    key,
    label: SUB_SCORE_LABELS[key],
    weight: SUB_SCORE_WEIGHTS[key],
    value: m.value,
    kind: 'measured',
    rationale: m.rationale,
    sectionRefs,
  });
  return [
    make('whitespace', whitespaceScore(analysis), ['s04', 's14']),
    make('maturity', maturityScore(analysis), ['s04', 's07']),
    make('reach', reachScore(analysis), ['s07', 's08']),
  ];
}

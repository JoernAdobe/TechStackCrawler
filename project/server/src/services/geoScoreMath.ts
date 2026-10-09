/**
 * GEO-Score / AI-Visibility – reine Rechenfunktionen (ohne I/O).
 * Formeln angelehnt an EAA geo-score-api (scoring_service.py, sentiment_service.py,
 * query_generation_service.py). Citation-Quality entfällt (Claude liefert keine Zitationen),
 * die AI-Visibility wird daher auf MF/PP/QC neu gewichtet.
 */
import type { FunnelStage, GeoScoreResult } from '../types/parity.js';

export const FUNNEL_STAGES: FunnelStage[] = ['Awareness', 'Interest', 'Consideration', 'Purchase'];

// ── Funnel-Verteilung ─────────────────────────────────────────────────────

/** Awareness 15 %, Interest 20 %, Purchase 15 %, Consideration = Rest. Jede Stage ≥ 1 (bei n ≥ 4). */
export function funnelDistribution(n: number): Record<FunnelStage, number> {
  const total = Math.max(0, Math.floor(n));
  if (total < 4) {
    const dist: Record<FunnelStage, number> = { Awareness: 0, Interest: 0, Consideration: 0, Purchase: 0 };
    for (let i = 0; i < total; i++) dist[(['Consideration', 'Interest', 'Awareness', 'Purchase'] as FunnelStage[])[i]]++;
    return dist;
  }
  const aw = Math.max(1, Math.round(total * 0.15));
  const it = Math.max(1, Math.round(total * 0.2));
  const pu = Math.max(1, Math.round(total * 0.15));
  return { Awareness: aw, Interest: it, Consideration: Math.max(1, total - aw - it - pu), Purchase: pu };
}

// ── Dedupe (Jaccard auf Token-Sets) ───────────────────────────────────────

const STOP_WORDS = new Set(
  (
    'a an the is are was were be been being have has had do does did will would could should may might shall can ' +
    'to of in for on with at by from as into through during before after and but or nor not so yet both either ' +
    'neither each every all any few more most other some such no only own same than too very just about above below ' +
    'between up down out off over under again further then once here there when where why how what which who whom ' +
    'this that these those i me my myself we our you your he him his she her it its they them their ' +
    'der die das ein eine einen einem einer und oder für mit von zu im in am an auf ist sind wie was welche welcher welches ' +
    'ich mein meine wir uns ihr sie es bei aus nach über'
  ).split(' '),
);

export function tokenize(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return new Set(normalized.filter((t) => !STOP_WORDS.has(t)));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

/** Entfernt Beinahe-Duplikate (Jaccard ≥ threshold), Reihenfolge bleibt erhalten. */
export function dedupeQueries<T extends { query: string }>(items: T[], threshold = 0.7): T[] {
  const kept: T[] = [];
  const keptTokens: Set<string>[] = [];
  for (const item of items) {
    const tokens = tokenize(item.query);
    if (keptTokens.some((k) => jaccard(tokens, k) >= threshold)) continue;
    kept.push(item);
    keptTokens.push(tokens);
  }
  return kept;
}

// ── Aliase & Matching ─────────────────────────────────────────────────────

const LEGAL_FORMS =
  /\b(gmbh\s*&\s*co\.?\s*kg(aa)?|gmbh|ag|se|kg(aa)?|ohg|e\.?\s?v\.?|ug|inc\.?|incorporated|corp\.?|corporation|co\.?|company|ltd\.?|limited|llc|plc|s\.?a\.?|s\.?p\.?a\.?|n\.?v\.?|b\.?v\.?|oy|ab|as|sarl|sas|group|holding)\b/giu;

const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu', 'or', 'ne', 'gv']);

/** Hostname ohne www. */
export function hostnameOf(urlOrDomain: string): string {
  let s = urlOrDomain.trim().toLowerCase();
  try {
    s = new URL(s.includes('://') ? s : `https://${s}`).hostname;
  } catch {
    /* Rohwert behalten */
  }
  return s.replace(/^www\d?\./, '');
}

/** Registrierbarer Name ohne TLD, z. B. "shop.bmw.co.uk" → "bmw". */
export function domainStem(urlOrDomain: string): string {
  const parts = hostnameOf(urlOrDomain).split('.').filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  if (tld.length === 2 && SECOND_LEVEL.has(sld) && parts.length >= 3) return parts[parts.length - 3];
  return sld;
}

export function stripLegalForm(name: string): string {
  return name.replace(LEGAL_FORMS, ' ').replace(/[,.&]+\s*$/u, '').replace(/\s+/g, ' ').trim();
}

/** Marke + Name ohne Rechtsform + Domain-Stem (dedupliziert, case-insensitive, min. 2 Zeichen). */
export function buildAliases(name: string, domain?: string): string[] {
  const candidates = [name, stripLegalForm(name)];
  if (domain) {
    const stem = domainStem(domain);
    candidates.push(stem);
    if (stem.includes('-')) candidates.push(stem.replace(/-/g, ' '));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    const t = c.trim();
    if (t.length < 2 || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface MentionMatch {
  mentioned: boolean;
  occurrences: number;
  /** Zeichen-Offset der ersten Erwähnung, -1 wenn keine. */
  firstOffset: number;
  /** firstOffset / Textlänge (0–1), undefined wenn keine Erwähnung. */
  firstPosition?: number;
  /** ±100 Zeichen um die erste Erwähnung. */
  excerpt?: string;
}

/** Case-insensitive Match mit Unicode-Wortgrenzen; überlappende Alias-Treffer zählen einmal. */
export function matchMentions(text: string, aliases: string[], excerptRadius = 100): MentionMatch {
  const clean = aliases.map((a) => a.trim()).filter((a) => a.length >= 2);
  if (!text || clean.length === 0) return { mentioned: false, occurrences: 0, firstOffset: -1 };
  // Längste Aliase zuerst, damit "Deutsche Bank" vor "Bank" greift.
  const pattern = clean
    .sort((a, b) => b.length - a.length)
    .map((a) => escapeRegex(a).replace(/\s+/g, '\\s+'))
    .join('|');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'giu');
  let occurrences = 0;
  let firstOffset = -1;
  for (const m of text.matchAll(re)) {
    occurrences++;
    if (firstOffset === -1) firstOffset = m.index ?? 0;
  }
  if (occurrences === 0) return { mentioned: false, occurrences: 0, firstOffset: -1 };
  const start = Math.max(0, firstOffset - excerptRadius);
  const end = Math.min(text.length, firstOffset + excerptRadius);
  const excerpt = `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
  return { mentioned: true, occurrences, firstOffset, firstPosition: firstOffset / text.length, excerpt };
}

// ── Sentiment (lexikonbasiert, deterministisch) ───────────────────────────

const POSITIVE = new Set(
  (
    'best leading top excellent great good popular trusted reliable recommended recommend innovative quality high-quality ' +
    'strong renowned premium favorite favourite affordable value reputable well-known known leader praised efficient ' +
    'secure easy convenient fast outstanding superior award-winning sustainable comprehensive flexible ' +
    'beste besten führend führende gut gute guter hervorragend beliebt beliebte vertrauenswürdig zuverlässig empfehlenswert ' +
    'empfohlen innovativ hochwertig stark bekannt günstig preiswert sicher einfach schnell nachhaltig ausgezeichnet'
  ).split(' '),
);
const NEGATIVE = new Set(
  (
    'bad poor worst expensive overpriced unreliable complaints complaint criticized criticised issues problems problem ' +
    'slow scandal lawsuit fraud weak outdated limited difficult hidden fees decline declining controversy risky avoid ' +
    'schlecht schlechte teuer überteuert unzuverlässig beschwerden kritik kritisiert probleme problem langsam skandal ' +
    'klage betrug schwach veraltet eingeschränkt schwierig versteckte gebühren rückgang riskant vermeiden'
  ).split(' '),
);
const NEGATORS = new Set(['not', 'no', 'never', "isn't", "aren't", "doesn't", 'nicht', 'kein', 'keine', 'nie']);

/** Normierter Compound-Score in (−1, 1), analog VADER-Normierung (alpha = 15). */
export function sentimentScore(text: string): number {
  const words = text.toLowerCase().match(/[\p{L}'-]+/gu) ?? [];
  let raw = 0;
  words.forEach((w, i) => {
    const pol = POSITIVE.has(w) ? 1 : NEGATIVE.has(w) ? -1 : 0;
    if (!pol) return;
    const negated = NEGATORS.has(words[i - 1] ?? '') || NEGATORS.has(words[i - 2] ?? '');
    raw += negated ? -pol : pol;
  });
  return raw / Math.sqrt(raw * raw + 15);
}

export function classifySentiment(text: string): 'Positive' | 'Neutral' | 'Negative' {
  const s = sentimentScore(text);
  if (s >= 0.05) return 'Positive';
  if (s <= -0.05) return 'Negative';
  return 'Neutral';
}

// ── Market Position ───────────────────────────────────────────────────────

export type MarketPosition = GeoScoreResult['marketPosition'];

/**
 * Positionsscore = bv/(bv+cv)·100 (0/0 → 50). Label über den Konkurrenz-Anteil (100 − Positionsscore):
 * ≤20 Market Leader, ≤40 Strong Position, ≤60 Competitive, sonst Challenged.
 */
export function marketPosition(brandVisibility: number, competitorVisibility: number): { label: MarketPosition; score: number } {
  const sum = brandVisibility + competitorVisibility;
  const score = sum > 0 ? (brandVisibility / sum) * 100 : 50;
  const compShare = 100 - score;
  const label: MarketPosition =
    compShare <= 20 ? 'Market Leader' : compShare <= 40 ? 'Strong Position' : compShare <= 60 ? 'Competitive' : 'Challenged';
  return { label, score: round1(score) };
}

// ── Country aus ccTLD ─────────────────────────────────────────────────────

const TLD_COUNTRY: Record<string, string> = {
  de: 'DE', at: 'AT', ch: 'CH', fr: 'FR', it: 'IT', es: 'ES', nl: 'NL', be: 'BE', lu: 'LU', uk: 'GB', gb: 'GB',
  ie: 'IE', pt: 'PT', pl: 'PL', cz: 'CZ', sk: 'SK', hu: 'HU', ro: 'RO', bg: 'BG', gr: 'GR', se: 'SE', no: 'NO',
  dk: 'DK', fi: 'FI', is: 'IS', ee: 'EE', lv: 'LV', lt: 'LT', si: 'SI', hr: 'HR', rs: 'RS', tr: 'TR', ru: 'RU',
  ua: 'UA', us: 'US', ca: 'CA', mx: 'MX', br: 'BR', ar: 'AR', cl: 'CL', co: 'CO', pe: 'PE', au: 'AU', nz: 'NZ',
  jp: 'JP', cn: 'CN', kr: 'KR', in: 'IN', sg: 'SG', hk: 'HK', tw: 'TW', my: 'MY', th: 'TH', id: 'ID', ph: 'PH',
  vn: 'VN', ae: 'AE', sa: 'SA', il: 'IL', za: 'ZA', eg: 'EG', ng: 'NG', ke: 'KE', ma: 'MA',
};

/** ISO-3166-Alpha-2 aus ccTLD, null bei generischen TLDs (.com, .io …). */
export function countryFromTld(urlOrDomain: string): string | null {
  const host = hostnameOf(urlOrDomain);
  const tld = host.split('.').pop() ?? '';
  return TLD_COUNTRY[tld] ?? null;
}

// ── Scores ────────────────────────────────────────────────────────────────

export interface ScoredQueryInput {
  stage: FunnelStage;
  /** false = Antwort fehlgeschlagen (zählt nicht in Nenner). */
  success: boolean;
  responseLength: number;
  brand: MentionMatch;
  sentiment?: 'Positive' | 'Neutral' | 'Negative';
  /** Namen der erwähnten Konkurrenten. */
  competitorsMentioned: string[];
}

export interface ComputedScores {
  geoScore: number;
  aiVisibility: number;
  components: GeoScoreResult['components'];
  shareOfVoicePct: number;
  marketPosition: MarketPosition;
  positionScore: number;
  funnel: GeoScoreResult['funnel'];
  competitors: Array<{ name: string; mentions: number; visibilityPct: number }>;
  brandMentions: number;
  successful: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeScores(queries: ScoredQueryInput[], competitorNames: string[]): ComputedScores {
  const ok = queries.filter((q) => q.success);
  const total = ok.length;
  const mentioned = ok.filter((q) => q.brand.mentioned);
  const our = mentioned.length;

  // Mention Frequency
  const densities = mentioned.map((q) =>
    Math.min(q.brand.occurrences / Math.max(q.responseLength / 1000, 0.1), 8),
  );
  const avgDensity = densities.length ? densities.reduce((a, b) => a + b, 0) / densities.length : 0;
  const baseRate = total ? (our / total) * 100 : 0;
  const mf = Math.min(baseRate * 0.8 + Math.min(avgDensity / 5, 1) * 100 * 0.2, 100);

  // Position & Prominence
  const proms = mentioned.map((q) => (q.brand.firstPosition === undefined ? 50 : (1 - q.brand.firstPosition) * 100));
  const pp = proms.length ? Math.min(proms.reduce((a, b) => a + b, 0) / proms.length, 100) : 0;

  // Query Coverage + Funnel
  const funnel = FUNNEL_STAGES.map((stage) => {
    const inStage = ok.filter((q) => q.stage === stage);
    const m = inStage.filter((q) => q.brand.mentioned).length;
    return { stage, queries: inStage.length, mentions: m, visibilityPct: inStage.length ? round1((m / inStage.length) * 100) : 0 };
  });
  const usedStages = funnel.filter((f) => f.queries > 0);
  const coverage = usedStages.length ? usedStages.filter((f) => f.mentions > 0).length / usedStages.length : 0;
  const avgStageRate = usedStages.length
    ? usedStages.reduce((a, f) => a + f.mentions / f.queries, 0) / usedStages.length
    : 0;
  const qc = coverage * 50 + avgStageRate * 50;

  const aiVisibility = mf * 0.5 + pp * 0.3 + qc * 0.2;

  // Sentiment (Anteil positiv + 0,5·neutral über erwähnte Queries; ohne Erwähnung neutral 50)
  const pos = mentioned.filter((q) => q.sentiment === 'Positive').length;
  const neu = mentioned.filter((q) => (q.sentiment ?? 'Neutral') === 'Neutral').length;
  const sentiment = our ? ((pos + 0.5 * neu) / our) * 100 : 50;

  // Konkurrenten
  const competitors = competitorNames.map((name) => {
    const mentions = ok.filter((q) => q.competitorsMentioned.includes(name)).length;
    return { name, mentions, visibilityPct: total ? round1((mentions / total) * 100) : 0 };
  });
  const maxComp = competitors.reduce((m, c) => Math.max(m, c.mentions), 0);
  const sumComp = competitors.reduce((s, c) => s + c.mentions, 0);
  let competitorGap: number;
  if (competitors.length === 0) competitorGap = 50;
  else if (maxComp === 0) competitorGap = our > 0 ? 100 : 50;
  else competitorGap = Math.min((our / maxComp) * 100, 100);

  const shareOfVoicePct = our + sumComp > 0 ? (our / (our + sumComp)) * 100 : 0;

  const compQueries = ok.filter((q) => q.competitorsMentioned.length > 0).length;
  const bv = total ? (our / total) * 100 : 0;
  const cv = total ? (compQueries / total) * 100 : 0;
  const mp = marketPosition(bv, cv);

  const geoScore = aiVisibility * (2 / 3) + competitorGap * (1 / 3);

  return {
    geoScore: round1(geoScore),
    aiVisibility: round1(aiVisibility),
    components: {
      mentionFrequency: round1(mf),
      prominence: round1(pp),
      queryCoverage: round1(qc),
      sentiment: round1(sentiment),
      competitorGap: round1(competitorGap),
    },
    shareOfVoicePct: round1(shareOfVoicePct),
    marketPosition: mp.label,
    positionScore: mp.score,
    funnel,
    competitors,
    brandMentions: our,
    successful: total,
  };
}

// ── Fallback-Empfehlungen ─────────────────────────────────────────────────

/** Regelbasierte Empfehlungen, wenn der LLM-Call fehlschlägt (max. 6). */
export function fallbackRecommendations(brand: string, s: ComputedScores): string[] {
  const recs: string[] = [];
  const weakest = [...s.funnel].filter((f) => f.queries > 0).sort((a, b) => a.visibilityPct - b.visibilityPct)[0];
  if (weakest && weakest.visibilityPct < 50) {
    recs.push(
      `Strengthen ${weakest.stage}-stage content: ${brand} appears in only ${weakest.visibilityPct}% of ${weakest.stage.toLowerCase()} queries – publish authoritative guides/FAQs answering these intents.`,
    );
  }
  const leader = [...s.competitors].sort((a, b) => b.mentions - a.mentions)[0];
  if (leader && leader.mentions > s.brandMentions) {
    recs.push(`Close the gap to ${leader.name} (${leader.mentions} vs. ${s.brandMentions} mentions): create comparison pages and differentiate clearly on key buying criteria.`);
  }
  if (s.components.prominence < 50 && s.brandMentions > 0) {
    recs.push(`Improve prominence: ${brand} is mentioned late in answers – make core value propositions explicit and consistent across owned and earned media.`);
  }
  if (s.components.mentionFrequency < 40) {
    recs.push('Increase brand presence in sources LLMs learn from: industry publications, review platforms, Wikipedia/Wikidata and structured data (schema.org Organization/Product).');
  }
  if (s.components.sentiment < 50) {
    recs.push('Address sentiment: monitor review sites and forums, respond to criticism and amplify positive customer evidence.');
  }
  recs.push('Track GEO visibility regularly (e.g. monthly) and correlate with content releases to measure impact.');
  return recs.slice(0, 6);
}

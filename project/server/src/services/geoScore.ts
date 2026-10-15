/**
 * GEO-Score / AI-Visibility (EAA-Parität zu apps/python/geo-score-api), ausschließlich mit Claude über Bedrock.
 * Ablauf: Company-Info → Country → Query-Generierung (Funnel) → Claude-Antworten je Query →
 * Matching Marke/Konkurrenten → Scores (geoScoreMath) → Empfehlungen.
 */
import { config } from '../config.js';
import { getBedrockClient } from './bedrockClient.js';
import { callLlm } from './llmCall.js';
import { parseAIJson } from '../utils/aiJson.js';
import type { AnalysisResult } from '../types/analysis.js';
import type { FunnelStage, GeoQueryResult, GeoScoreResult } from '../types/parity.js';
import {
  FUNNEL_STAGES,
  buildAliases,
  classifySentiment,
  computeScores,
  countryFromTld,
  dedupeQueries,
  domainStem,
  fallbackRecommendations,
  funnelDistribution,
  hostnameOf,
  matchMentions,
  type ComputedScores,
  type ScoredQueryInput,
} from './geoScoreMath.js';

export interface GeoScoreOptions {
  brand?: string;
  competitors?: string[];
  country?: string;
  queryCount?: number;
}

interface CompanyInfo {
  name: string;
  description: string;
  industry: string;
  products: string[];
  keywords: string[];
  competitors: Array<{ name: string; domain?: string }>;
  country?: string;
}

interface GeneratedQuery {
  query: string;
  stage: FunnelStage;
}

const ANSWER_CONCURRENCY = 4;
const ANSWER_MAX_TOKENS = 600;

export const METHODOLOGY_NOTE =
  'AI visibility is measured by asking Claude (via Amazon Bedrock) neutral, brand-free user questions along the ' +
  'marketing funnel (Awareness 15%, Interest 20%, Consideration, Purchase 15%) and checking whether the brand and its ' +
  'competitors appear in the answers. Claude answers serve as a proxy for generative search engines (ChatGPT, Gemini, ' +
  'Perplexity); no web search and no source citations are involved, so the EAA citation-quality component is omitted and ' +
  'AI Visibility is re-weighted (Mention Frequency 50%, Position & Prominence 30%, Query Coverage 20%). ' +
  'GEO Score = AI Visibility × 2/3 + Competitor Gap × 1/3. Sentiment is lexicon-based on the answer excerpt. ' +
  'Results are a single-run snapshot of one model and may vary between runs.';

const LANGUAGE_BY_COUNTRY: Record<string, string> = {
  DE: 'German', AT: 'German', CH: 'German', LU: 'German', FR: 'French', BE: 'French', IT: 'Italian', ES: 'Spanish',
  MX: 'Spanish', AR: 'Spanish', CL: 'Spanish', CO: 'Spanish', PE: 'Spanish', PT: 'Portuguese', BR: 'Portuguese',
  NL: 'Dutch', PL: 'Polish', CZ: 'Czech', SE: 'Swedish', NO: 'Norwegian', DK: 'Danish', FI: 'Finnish', JP: 'Japanese',
  CN: 'Chinese', TW: 'Chinese', KR: 'Korean', TR: 'Turkish', GR: 'Greek', HU: 'Hungarian', RO: 'Romanian',
};

export function languageForCountry(country: string): string {
  return LANGUAGE_BY_COUNTRY[country.toUpperCase()] ?? 'English';
}

async function llm(system: string, user: string, maxTokens: number): Promise<string> {
  return callLlm(
    'geo-score',
    async (signal) => {
      const response = await getBedrockClient().messages.create(
        {
          model: config.bedrock.model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
        },
        { signal, maxRetries: 0 },
      );
      return response.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
        .trim();
    },
    // Viele kleine Calls parallel – kürzerer Timeout, weniger Versuche.
    { attempts: 2, timeoutMs: 90_000 },
  );
}

/** Einfacher Promise-Pool mit fester Parallelität, Reihenfolge der Ergebnisse bleibt erhalten. */
async function promisePool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function asStringArray(v: unknown, max: number): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()).slice(0, max) : [];
}

/** "Name", "name.com" oder "Name (name.com)" → { name, domain }. */
export function parseCompetitorInput(raw: string): { name: string; domain?: string } {
  const s = raw.trim();
  const paren = s.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (paren) return { name: paren[1].trim(), domain: hostnameOf(paren[2]) };
  if (/^[\w-]+(\.[\w-]+)+$/.test(s)) {
    const stem = domainStem(s);
    return { name: stem.charAt(0).toUpperCase() + stem.slice(1), domain: hostnameOf(s) };
  }
  return { name: s };
}

// ── 1. Company-Info ───────────────────────────────────────────────────────

async function extractCompanyInfo(analysis: AnalysisResult, domain: string): Promise<CompanyInfo> {
  const prompt = `Identify the company behind this website for a brand-visibility study.

URL: ${analysis.finalUrl ?? analysis.url}
Domain: ${domain}
Tech-stack summary: ${(analysis.summary ?? '').slice(0, 1500)}
Page content excerpt:
"""
${(analysis.pageContentExcerpt ?? '').slice(0, 4000)}
"""

Return JSON only:
{"name":"brand name as consumers know it","description":"1-2 sentences","industry":"specific industry",
"products":["max 6 main products/services"],"keywords":["max 8 generic category keywords, no brand names"],
"competitors":[{"name":"direct competitor brand","domain":"competitor.com"}],
"country":"ISO-3166 alpha-2 of the primary market or GLOBAL"}
Rules: max 3 competitors, real direct competitors in the same market, each with its main domain.`;
  const text = await llm('You are a market analyst. Respond with valid JSON only, no markdown.', prompt, 1200);
  const raw = parseAIJson<Record<string, unknown>>(text);
  const competitors = Array.isArray(raw.competitors)
    ? (raw.competitors as Array<Record<string, unknown>>)
        .filter((c) => c && typeof c.name === 'string' && c.name.trim())
        .slice(0, 3)
        .map((c) => ({ name: String(c.name).trim(), domain: typeof c.domain === 'string' ? hostnameOf(c.domain) : undefined }))
    : [];
  return {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : domainStem(domain),
    description: typeof raw.description === 'string' ? raw.description : '',
    industry: typeof raw.industry === 'string' && raw.industry.trim() ? raw.industry.trim() : 'Unknown',
    products: asStringArray(raw.products, 6),
    keywords: asStringArray(raw.keywords, 8),
    competitors,
    country: typeof raw.country === 'string' ? raw.country.trim().toUpperCase() : undefined,
  };
}

// ── 3. Query-Generierung ──────────────────────────────────────────────────

async function generateQueries(info: CompanyInfo, country: string, n: number, brandAliases: string[]): Promise<GeneratedQuery[]> {
  const dist = funnelDistribution(n);
  // Puffer für Dedupe und Marken-Filter.
  const ask = funnelDistribution(n + Math.max(4, Math.round(n * 0.25)));
  const geo =
    country === 'GLOBAL'
      ? ''
      : `\nTarget market: ${country}. Write the queries in ${languageForCountry(country)} and use locale-appropriate retailers, currencies and conventions.`;
  const prompt = `Generate realistic questions that people type into AI assistants (ChatGPT, Gemini, Perplexity) when researching the ${info.industry} industry.

Industry context:
- Products & services: ${info.products.join(', ') || 'n/a'}
- Keywords: ${info.keywords.join(', ') || 'n/a'}${geo}

CRITICAL RULES
1. Do NOT mention any specific brand or company names.
2. Every query must represent a unique user intent – no synonym swaps of the same sentence.
3. Natural, industry-appropriate language.

Generate exactly: ${ask.Awareness} Awareness, ${ask.Interest} Interest, ${ask.Consideration} Consideration, ${ask.Purchase} Purchase queries.
- Awareness: discovering a problem/topic (trends, education, how things work).
- Interest: exploring options ("best of" lists, what to look for).
- Consideration: comparing/evaluating (reviews, pros/cons, alternatives, which provider is best for X).
- Purchase: ready to buy (pricing, deals, where to buy, sign-up).

Return JSON only: {"queries":[{"query":"...","stage":"Awareness|Interest|Consideration|Purchase"}]}`;
  const text = await llm('You generate search queries. Respond with valid JSON only, no markdown.', prompt, 3000);
  const parsed = parseAIJson<{ queries?: Array<{ query?: unknown; stage?: unknown }> }>(text);
  const all = (parsed.queries ?? [])
    .filter((q) => typeof q.query === 'string' && FUNNEL_STAGES.includes(q.stage as FunnelStage))
    .map((q) => ({ query: String(q.query).trim(), stage: q.stage as FunnelStage }))
    .filter((q) => q.query && !matchMentions(q.query, brandAliases).mentioned);
  const unique = dedupeQueries(all, 0.7);

  // Pro Stage auf Zielverteilung kürzen, Fehlbestände aus Überhang anderer Stages auffüllen.
  const picked: GeneratedQuery[] = [];
  const leftovers: GeneratedQuery[] = [];
  for (const stage of FUNNEL_STAGES) {
    const inStage = unique.filter((q) => q.stage === stage);
    picked.push(...inStage.slice(0, dist[stage]));
    leftovers.push(...inStage.slice(dist[stage]));
  }
  while (picked.length < n && leftovers.length) picked.push(leftovers.shift()!);
  if (picked.length === 0) throw new Error('Query generation returned no usable queries');
  return picked;
}

// ── 4. Antworten ──────────────────────────────────────────────────────────

async function answerQuery(query: string, country: string): Promise<string> {
  const lang = country === 'GLOBAL' ? 'the language of the question' : languageForCountry(country);
  const market = country === 'GLOBAL' ? '' : ` The user is located in ${country}.`;
  return llm(
    `You are a helpful AI assistant answering a consumer's question. Give a concise, practical answer and name specific brands, providers or products where relevant. Answer in ${lang}.${market}`,
    query,
    ANSWER_MAX_TOKENS,
  );
}

// ── 7. Empfehlungen ───────────────────────────────────────────────────────

async function generateRecommendations(info: CompanyInfo, scores: ComputedScores, queries: GeoQueryResult[]): Promise<string[]> {
  const missed = queries.filter((q) => !q.brandMentioned).slice(0, 8).map((q) => `[${q.stage}] ${q.query}`);
  const prompt = `Brand: ${info.name} (${info.industry})
GEO results (0-100): ${JSON.stringify(scores.components)}, AI visibility ${scores.aiVisibility}, share of voice ${scores.shareOfVoicePct}%, market position ${scores.marketPosition}.
Funnel visibility: ${scores.funnel.map((f) => `${f.stage} ${f.visibilityPct}% (${f.mentions}/${f.queries})`).join(', ')}
Competitors (mentions): ${scores.competitors.map((c) => `${c.name} ${c.mentions}`).join(', ') || 'none'} vs. brand ${scores.brandMentions}
Queries where the brand was NOT mentioned:
${missed.join('\n') || '-'}

Give at most 6 concrete, prioritized Generative Engine Optimization recommendations addressing the weakest funnel stage, competitors ahead and low prominence. One sentence each.
Return JSON only: {"recommendations":["..."]}`;
  const text = await llm('You are a GEO (Generative Engine Optimization) consultant. Respond with valid JSON only.', prompt, 1000);
  const recs = asStringArray(parseAIJson<{ recommendations?: unknown }>(text).recommendations, 6);
  if (!recs.length) throw new Error('No recommendations');
  return recs;
}

// ── Assemble ──────────────────────────────────────────────────────────────

function resolveCountry(requested: string | undefined, domain: string, llmCountry: string | undefined): string {
  if (requested?.trim().toUpperCase() === 'GLOBAL') return 'GLOBAL';
  const valid = (c?: string) => (c && /^[A-Z]{2}$/.test(c.trim().toUpperCase()) ? c.trim().toUpperCase() : null);
  return valid(requested) ?? countryFromTld(domain) ?? valid(llmCountry) ?? 'GLOBAL';
}

export async function runGeoScore(analysis: AnalysisResult, opts: GeoScoreOptions = {}): Promise<GeoScoreResult> {
  const domain = hostnameOf(analysis.finalUrl ?? analysis.url);
  const n = Math.min(40, Math.max(8, Math.round(opts.queryCount ?? 20)));
  if (process.env.USE_MOCK_AI === '1') return mockGeoScore(analysis, domain, opts, n);

  const extracted = await extractCompanyInfo(analysis, domain);
  const userCompetitors = (opts.competitors ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 5).map(parseCompetitorInput);
  const info: CompanyInfo = {
    ...extracted,
    name: opts.brand?.trim() || extracted.name,
    competitors: userCompetitors.length ? userCompetitors : extracted.competitors,
  };
  const country = resolveCountry(opts.country, domain, extracted.country);
  const brandAliases = buildAliases(info.name, domain);
  const compAliases = info.competitors.map((c) => ({ name: c.name, aliases: buildAliases(c.name, c.domain) }));

  const queries = await generateQueries(info, country, n, brandAliases);

  const answers = await promisePool(queries, ANSWER_CONCURRENCY, async (q) => {
    try {
      return await answerQuery(q.query, country);
    } catch (err) {
      console.warn(`[geo] answer failed for "${q.query}":`, err instanceof Error ? err.message : err);
      return null;
    }
  });

  const scored: ScoredQueryInput[] = [];
  const queryResults: GeoQueryResult[] = [];
  queries.forEach((q, i) => {
    const text = answers[i];
    const brand = text ? matchMentions(text, brandAliases) : { mentioned: false, occurrences: 0, firstOffset: -1 };
    const competitorsMentioned = text ? compAliases.filter((c) => matchMentions(text, c.aliases).mentioned).map((c) => c.name) : [];
    const sentiment = brand.mentioned && brand.excerpt ? classifySentiment(brand.excerpt) : undefined;
    scored.push({ stage: q.stage, success: text !== null, responseLength: text?.length ?? 0, brand, sentiment, competitorsMentioned });
    queryResults.push({
      query: q.query,
      stage: q.stage,
      brandMentioned: brand.mentioned,
      firstPosition: brand.firstPosition !== undefined ? Math.round(brand.firstPosition * 1000) / 1000 : undefined,
      competitorsMentioned,
      sentiment,
      excerpt: brand.excerpt,
    });
  });
  if (!scored.some((s) => s.success)) throw new Error('All Claude answer calls failed');

  const scores = computeScores(scored, info.competitors.map((c) => c.name));
  let recommendations: string[];
  try {
    recommendations = await generateRecommendations(info, scores, queryResults);
  } catch (err) {
    console.warn('[geo] recommendation generation failed, using fallback rules:', err instanceof Error ? err.message : err);
    recommendations = fallbackRecommendations(info.name, scores);
  }

  return assemble(info, domain, country, scores, queryResults, recommendations);
}

function assemble(
  info: CompanyInfo,
  domain: string,
  country: string,
  scores: ComputedScores,
  queries: GeoQueryResult[],
  recommendations: string[],
): GeoScoreResult {
  return {
    brand: info.name,
    domain,
    country,
    industry: info.industry,
    fetchedAt: new Date().toISOString(),
    model: process.env.USE_MOCK_AI === '1' ? 'mock' : config.bedrock.model,
    geoScore: scores.geoScore,
    aiVisibility: scores.aiVisibility,
    components: scores.components,
    shareOfVoicePct: scores.shareOfVoicePct,
    marketPosition: scores.marketPosition,
    funnel: scores.funnel,
    competitors: scores.competitors.map((c) => ({
      ...c,
      domain: info.competitors.find((x) => x.name === c.name)?.domain,
    })),
    queries,
    recommendations,
    methodologyNote: METHODOLOGY_NOTE,
  };
}

// ── 9. Mock ───────────────────────────────────────────────────────────────

function mockGeoScore(analysis: AnalysisResult, domain: string, opts: GeoScoreOptions, n: number): GeoScoreResult {
  const stem = domainStem(domain) || 'brand';
  const brand = opts.brand?.trim() || stem.charAt(0).toUpperCase() + stem.slice(1);
  const competitors = (opts.competitors?.length ? opts.competitors : ['Competitor A', 'Competitor B'])
    .slice(0, 5)
    .map(parseCompetitorInput);
  const country = resolveCountry(opts.country, domain, undefined);
  const dist = funnelDistribution(n);
  const scored: ScoredQueryInput[] = [];
  const queryResults: GeoQueryResult[] = [];
  let i = 0;
  for (const stage of FUNNEL_STAGES) {
    for (let k = 0; k < dist[stage]; k++, i++) {
      const mentioned = i % 3 !== 2;
      const comps = competitors.filter((_, ci) => (i + ci) % 2 === 0).map((c) => c.name);
      const text = mentioned
        ? `For this question, ${brand} is a trusted and popular option. Alternatives include ${comps.join(', ') || 'others'}.`
        : `Popular options include ${comps.join(', ') || 'several providers'}.`;
      const match = matchMentions(text, [brand]);
      const sentiment = match.mentioned && match.excerpt ? classifySentiment(match.excerpt) : undefined;
      scored.push({ stage, success: true, responseLength: text.length, brand: match, sentiment, competitorsMentioned: comps });
      queryResults.push({
        query: `Mock ${stage.toLowerCase()} query #${k + 1} about ${analysis.summary ? 'this industry' : 'the category'}`,
        stage,
        brandMentioned: match.mentioned,
        firstPosition: match.firstPosition,
        competitorsMentioned: comps,
        sentiment,
        excerpt: match.excerpt,
      });
    }
  }
  const scores = computeScores(scored, competitors.map((c) => c.name));
  const info: CompanyInfo = { name: brand, description: '', industry: 'Mock Industry', products: [], keywords: [], competitors };
  return assemble(info, domain, country, scores, queryResults, fallbackRecommendations(brand, scores));
}

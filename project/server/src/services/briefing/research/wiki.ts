/** Wikipedia-REST-Summary + Wikidata-Entity (Gründung, HQ, Mitarbeiter, CEO, Umsatz, Börse, ISIN, CIK, LEI, Website). */
import { getJson, type HttpGet } from './http.js';
import { formatMonYear, hostOf, registrableDomain } from './text.js';

export const RESEARCH_UA = 'TechStack Analyzer briefing (adobe.com)';
const HEADERS = { 'User-Agent': RESEARCH_UA, 'Api-User-Agent': RESEARCH_UA };

export interface WikipediaSummary {
  title: string;
  extract: string;
  url: string;
  qid?: string;
  date: string | null;
}

export interface WikidataFacts {
  qid: string;
  url: string;
  label?: string;
  description?: string;
  founded?: string;
  headquarters?: string;
  employees?: { value: number; asOf?: string };
  ceo?: string;
  revenue?: { amount: number; currency: string; asOf?: string };
  exchanges: Array<{ exchange: string; ticker?: string }>;
  isin?: string;
  cik?: string;
  lei?: string;
  website?: string;
  date: string | null;
}

// ── Wikidata-Parsing (rein) ────────────────────────────────────────────────

interface Snak {
  snaktype?: string;
  datavalue?: { value: unknown; type?: string };
}
interface Claim {
  rank?: 'preferred' | 'normal' | 'deprecated';
  mainsnak: Snak;
  qualifiers?: Record<string, Snak[]>;
}
export interface WikidataEntity {
  id: string;
  modified?: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, Claim[]>;
}

const CURRENCIES: Record<string, string> = {
  Q4917: 'USD', Q4916: 'EUR', Q25224: 'GBP', Q25344: 'CHF', Q8146: 'JPY', Q39099: 'CNY',
  Q25417: 'SEK', Q25377: 'NOK', Q1104069: 'CAD', Q259502: 'AUD', Q81893: 'INR', Q202040: 'KRW',
};

function qualifierTime(c: Claim, prop: string): string | undefined {
  const v = c.qualifiers?.[prop]?.[0]?.datavalue?.value as { time?: string } | undefined;
  return v?.time?.replace(/^\+/, '');
}

/** Bevorzugte, nicht beendete Claims; bei Mengen der jüngste (Qualifier P585). */
function pickClaims(entity: WikidataEntity, prop: string): Claim[] {
  const all = (entity.claims?.[prop] ?? []).filter((c) => c.rank !== 'deprecated' && c.mainsnak?.datavalue);
  const active = all.filter((c) => !c.qualifiers?.P582);
  const pool = active.length ? active : all;
  const preferred = pool.filter((c) => c.rank === 'preferred');
  const list = preferred.length ? preferred : pool;
  return [...list].sort((a, b) => (qualifierTime(b, 'P585') ?? '').localeCompare(qualifierTime(a, 'P585') ?? ''));
}

const itemId = (c?: Claim) => (c?.mainsnak.datavalue?.value as { id?: string } | undefined)?.id;
const str = (c?: Claim) => (typeof c?.mainsnak.datavalue?.value === 'string' ? (c.mainsnak.datavalue.value as string) : undefined);

export interface ParsedWikidata {
  facts: Omit<WikidataFacts, 'headquarters' | 'ceo' | 'exchanges'>;
  hqId?: string;
  ceoId?: string;
  exchanges: Array<{ id: string; ticker?: string }>;
}

export function parseWikidataEntity(entity: WikidataEntity): ParsedWikidata {
  const time = pickClaims(entity, 'P571')[0]?.mainsnak.datavalue?.value as { time?: string } | undefined;
  const emp = pickClaims(entity, 'P1128')[0];
  const rev = pickClaims(entity, 'P2139')[0];
  const empVal = emp?.mainsnak.datavalue?.value as { amount?: string } | undefined;
  const revVal = rev?.mainsnak.datavalue?.value as { amount?: string; unit?: string } | undefined;
  const unitId = revVal?.unit?.split('/').pop() ?? '';
  return {
    facts: {
      qid: entity.id,
      url: `https://www.wikidata.org/wiki/${entity.id}`,
      label: entity.labels?.en?.value,
      description: entity.descriptions?.en?.value,
      founded: time?.time?.replace(/^\+/, '').slice(0, 4),
      employees: empVal?.amount ? { value: Number(empVal.amount), asOf: qualifierTime(emp, 'P585')?.slice(0, 4) } : undefined,
      revenue: revVal?.amount
        ? { amount: Number(revVal.amount), currency: CURRENCIES[unitId] ?? unitId, asOf: qualifierTime(rev, 'P585')?.slice(0, 4) }
        : undefined,
      isin: str(pickClaims(entity, 'P946')[0]),
      cik: str(pickClaims(entity, 'P5531')[0]),
      lei: str(pickClaims(entity, 'P1278')[0]),
      website: str(pickClaims(entity, 'P856')[0]),
      date: formatMonYear(entity.modified),
    },
    hqId: itemId(pickClaims(entity, 'P159')[0]),
    ceoId: itemId(pickClaims(entity, 'P169')[0]),
    exchanges: pickClaims(entity, 'P414')
      .slice(0, 3)
      .map((c) => ({ id: itemId(c) ?? '', ticker: c.qualifiers?.P249?.[0]?.datavalue?.value as string | undefined }))
      .filter((e) => e.id),
  };
}

/** Prüft, ob die offizielle Website der Wikidata-Entity zur analysierten Domain passt. */
export function websiteMatches(website: string | undefined, domain: string): boolean {
  if (!website) return false;
  const a = registrableDomain(hostOf(website));
  const b = registrableDomain(domain);
  return Boolean(a && b) && (a === b || a.split('.')[0] === b.split('.')[0]);
}

// ── Abrufe ─────────────────────────────────────────────────────────────────

export async function searchWikipediaTitles(httpGet: HttpGet, query: string, limit = 3): Promise<string[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=${limit}&srsearch=${encodeURIComponent(query)}`;
  const data = await getJson<{ query?: { search?: Array<{ title: string }> } }>(httpGet, url, { headers: HEADERS });
  return data?.query?.search?.map((s) => s.title) ?? [];
}

export async function fetchWikipediaSummary(httpGet: HttpGet, title: string): Promise<WikipediaSummary | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  const d = await getJson<{
    type?: string;
    title?: string;
    extract?: string;
    wikibase_item?: string;
    timestamp?: string;
    content_urls?: { desktop?: { page?: string } };
  }>(httpGet, url, { headers: HEADERS });
  if (!d?.title || d.type === 'disambiguation') return null;
  return {
    title: d.title,
    extract: (d.extract ?? '').slice(0, 1_500),
    url: d.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(d.title.replace(/ /g, '_'))}`,
    qid: d.wikibase_item,
    date: formatMonYear(d.timestamp),
  };
}

async function fetchLabels(httpGet: HttpGet, ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels&languages=en&ids=${ids.join('|')}`;
  const d = await getJson<{ entities?: Record<string, { labels?: { en?: { value: string } } }> }>(httpGet, url, { headers: HEADERS });
  const out: Record<string, string> = {};
  for (const [id, e] of Object.entries(d?.entities ?? {})) if (e.labels?.en?.value) out[id] = e.labels.en.value;
  return out;
}

export async function fetchWikidataFacts(httpGet: HttpGet, qid: string): Promise<WikidataFacts | null> {
  if (!/^Q\d+$/.test(qid)) return null;
  const d = await getJson<{ entities?: Record<string, WikidataEntity> }>(
    httpGet,
    `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
    { headers: HEADERS, maxBytes: 8 * 1024 * 1024 },
  );
  const entity = d?.entities?.[qid] ?? Object.values(d?.entities ?? {})[0];
  if (!entity) return null;
  const parsed = parseWikidataEntity(entity);
  const ids = [parsed.hqId, parsed.ceoId, ...parsed.exchanges.map((e) => e.id)].filter((x): x is string => Boolean(x));
  const labels = await fetchLabels(httpGet, [...new Set(ids)]);
  return {
    ...parsed.facts,
    headquarters: parsed.hqId ? labels[parsed.hqId] : undefined,
    ceo: parsed.ceoId ? labels[parsed.ceoId] : undefined,
    exchanges: parsed.exchanges.map((e) => ({ exchange: labels[e.id] ?? e.id, ticker: e.ticker })),
  };
}

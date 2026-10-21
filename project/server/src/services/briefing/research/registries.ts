/** SEC EDGAR companyfacts (nur bei bekanntem CIK) und GLEIF-LEI-Daten. */
import { getJson, type HttpGet } from './http.js';
import { formatMonYear } from './text.js';
import { RESEARCH_UA } from './wiki.js';

// ── SEC ────────────────────────────────────────────────────────────────────

interface SecFact {
  start?: string;
  end: string;
  val: number;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
}

export interface SecFigure {
  concept: string;
  value: number;
  periodEnd: string;
  fiscalYear?: number;
  form?: string;
  filed?: string;
}

export interface SecFinancials {
  cik: string;
  entityName?: string;
  url: string;
  revenue?: SecFigure;
  revenuePrior?: SecFigure;
  netIncome?: SecFigure;
  netIncomePrior?: SecFigure;
  date: string | null;
}

const REVENUE_CONCEPTS = [
  'Revenues',
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'SalesRevenueNet',
  'RevenueFromContractWithCustomerIncludingAssessedTax',
];

export function padCik(cik: string): string | null {
  const digits = cik.replace(/\D/g, '');
  return digits && digits.length <= 10 ? digits.padStart(10, '0') : null;
}

/** Jahreswerte (10-K/20-F, Laufzeit ≈ 1 Jahr), neuester zuerst, je Periodenende einmal. */
function annualSeries(facts: SecFact[] | undefined, concept: string): SecFigure[] {
  const byEnd = new Map<string, SecFigure>();
  for (const f of facts ?? []) {
    if (!/^(10-K|20-F|40-F)/.test(f.form ?? '')) continue;
    if (f.start) {
      const days = (Date.parse(f.end) - Date.parse(f.start)) / 86_400_000;
      if (days < 340 || days > 380) continue;
    } else if (f.fp && f.fp !== 'FY') continue;
    const prev = byEnd.get(f.end);
    if (!prev || (f.filed ?? '') > (prev.filed ?? '')) {
      byEnd.set(f.end, { concept, value: f.val, periodEnd: f.end, fiscalYear: f.fy, form: f.form, filed: f.filed });
    }
  }
  return [...byEnd.values()].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
}

type CompanyFacts = {
  entityName?: string;
  facts?: { 'us-gaap'?: Record<string, { units?: Record<string, SecFact[]> }> };
};

export function parseCompanyFacts(json: CompanyFacts, cik: string, url: string): SecFinancials {
  const gaap = json.facts?.['us-gaap'] ?? {};
  let revenue: SecFigure[] = [];
  for (const concept of REVENUE_CONCEPTS) {
    const series = annualSeries(gaap[concept]?.units?.USD, concept);
    if (series.length && (!revenue.length || series[0].periodEnd > revenue[0].periodEnd)) revenue = series;
  }
  const net = annualSeries(gaap.NetIncomeLoss?.units?.USD, 'NetIncomeLoss');
  return {
    cik,
    entityName: json.entityName,
    url,
    revenue: revenue[0],
    revenuePrior: revenue[1],
    netIncome: net[0],
    netIncomePrior: net[1],
    date: formatMonYear(revenue[0]?.filed ?? net[0]?.filed),
  };
}

export async function fetchSecFinancials(httpGet: HttpGet, cik: string): Promise<SecFinancials | null> {
  const padded = padCik(cik);
  if (!padded) return null;
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`;
  const json = await getJson<CompanyFacts>(httpGet, url, {
    headers: { 'User-Agent': RESEARCH_UA },
    maxBytes: 30 * 1024 * 1024,
    timeoutMs: 20_000,
  });
  if (!json) return null;
  const parsed = parseCompanyFacts(json, padded, url);
  return parsed.revenue || parsed.netIncome ? parsed : null;
}

// ── GLEIF ──────────────────────────────────────────────────────────────────

export interface GleifRecord {
  lei: string;
  legalName: string;
  legalCity?: string;
  legalCountry?: string;
  hqCity?: string;
  hqCountry?: string;
  status?: string;
  parentName?: string;
  url: string;
  date: string | null;
}

interface GleifData {
  id: string;
  attributes?: {
    lei?: string;
    entity?: {
      legalName?: { name?: string };
      legalAddress?: { city?: string; country?: string };
      headquartersAddress?: { city?: string; country?: string };
      status?: string;
    };
    registration?: { lastUpdateDate?: string };
  };
}

export function parseGleifRecord(d: GleifData): GleifRecord | null {
  const e = d.attributes?.entity;
  const lei = d.attributes?.lei ?? d.id;
  if (!lei || !e?.legalName?.name) return null;
  return {
    lei,
    legalName: e.legalName.name,
    legalCity: e.legalAddress?.city,
    legalCountry: e.legalAddress?.country,
    hqCity: e.headquartersAddress?.city,
    hqCountry: e.headquartersAddress?.country,
    status: e.status,
    url: `https://api.gleif.org/api/v1/lei-records/${lei}`,
    date: formatMonYear(d.attributes?.registration?.lastUpdateDate),
  };
}

export async function fetchGleif(httpGet: HttpGet, query: { lei?: string; legalName?: string }): Promise<GleifRecord | null> {
  let record: GleifRecord | null = null;
  if (query.lei && /^[A-Z0-9]{20}$/.test(query.lei)) {
    const d = await getJson<{ data?: GleifData }>(httpGet, `https://api.gleif.org/api/v1/lei-records/${query.lei}`);
    record = d?.data ? parseGleifRecord(d.data) : null;
  } else if (query.legalName) {
    const url = `https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=${encodeURIComponent(query.legalName)}&page[size]=1`;
    const d = await getJson<{ data?: GleifData[] }>(httpGet, url);
    record = d?.data?.[0] ? parseGleifRecord(d.data[0]) : null;
  }
  if (!record) return null;
  const parent = await getJson<{ data?: GleifData }>(httpGet, `https://api.gleif.org/api/v1/lei-records/${record.lei}/ultimate-parent`);
  const parentName = parent?.data?.attributes?.entity?.legalName?.name;
  if (parentName && parentName !== record.legalName) record.parentName = parentName;
  return record;
}

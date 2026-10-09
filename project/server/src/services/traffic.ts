import type { TrafficCountryShare, TrafficResult } from '../types/parity.js';

/**
 * Traffic-Insights. Quellen:
 * - Semrush Trends API v3 (summary / geo / toppages) – nur mit SEMRUSH_API_KEY.
 *   Antworten sind CSV mit ';' als Trenner, Fehler kommen als Text "ERROR <n> :: <msg>".
 * - Tranco-Liste (https://tranco-list.eu/api_documentation) – frei, ohne Key,
 *   GET /api/ranks/domain/<domain> → { ranks: [{ date, rank }] }.
 * Fehler pro Quelle landen in `notes`; die Funktion wirft nie.
 */

const SEMRUSH_BASE = 'https://api.semrush.com/analytics/ta/api/v3';
const TRANCO_BASE = 'https://tranco-list.eu/api/ranks/domain';
const TIMEOUT_MS = 30_000;
const TOP_LIMIT = 5;

export type SemrushRow = Record<string, string>;
type SemrushData = NonNullable<TrafficResult['semrush']>;

/** Extrahiert die Domain (ohne Protokoll, Pfad, Port und führendes "www."). */
export function normalizeDomain(domainOrUrl: string): string {
  const raw = domainOrUrl.trim();
  let host = raw;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname;
  } catch {
    host = raw.split(/[/?#:]/)[0] ?? raw;
  }
  return host.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

/** Parst eine Semrush-CSV-Antwort. Wirft bei "ERROR …"-Payloads (außer NOTHING FOUND → []). */
export function parseSemrushCsv(text: string): SemrushRow[] {
  const body = text.replace(/^\uFEFF/, '').trim();
  if (!body) return [];
  if (/^ERROR\s+\d+/i.test(body)) {
    if (/NOTHING FOUND/i.test(body)) return [];
    throw new Error(`Semrush: ${body.split('\n')[0]}`);
  }
  const lines = body.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = (lines.shift() ?? '').split(';').map((h) => h.trim());
  return lines.map((line) => {
    const cells = line.split(';');
    const row: SemrushRow = {};
    header.forEach((h, i) => {
      row[h] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

function toNum(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Semrush liefert Anteile/Raten als Dezimalwert (0–1); Werte > 1 gelten bereits als Prozent. */
function toPct(value: string | undefined): number | undefined {
  const n = toNum(value);
  if (n === undefined) return undefined;
  const pct = n <= 1 ? n * 100 : n;
  return Math.round(pct * 10) / 10;
}

function defined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export function parseSemrushSummary(
  rows: SemrushRow[],
): Omit<SemrushData, 'topCountries' | 'topPages'> | null {
  const row = rows[0];
  if (!row) return null;
  const pagesPerVisit = toNum(row.pages_per_visit);
  return defined({
    displayDate: row.display_date || undefined,
    visits: toNum(row.visits),
    desktopVisits: toNum(row.desktop_visits),
    mobileVisits: toNum(row.mobile_visits),
    pagesPerVisit: pagesPerVisit === undefined ? undefined : Math.round(pagesPerVisit * 100) / 100,
    bounceRatePct: toPct(row.bounce_rate),
    avgVisitDurationSec: toNum(row.time_on_site),
    uniqueVisitors: toNum(row.users),
  });
}

export function parseSemrushGeo(rows: SemrushRow[], limit = TOP_LIMIT): TrafficCountryShare[] {
  return rows
    .filter((r) => r.geo)
    .map((r) =>
      defined({
        country: r.geo.toUpperCase(),
        sharePct: toPct(r.traffic_share) ?? 0,
        visits: toNum(r.traffic),
      }),
    )
    .sort((a, b) => (b.visits ?? b.sharePct) - (a.visits ?? a.sharePct))
    .slice(0, limit);
}

export function parseSemrushTopPages(
  rows: SemrushRow[],
  limit = TOP_LIMIT,
): SemrushData['topPages'] {
  return rows
    .filter((r) => r.page)
    .map((r) => defined({ page: r.page, trafficSharePct: toPct(r.traffic_share) }))
    .slice(0, limit);
}

/** Neuester Rang aus der Tranco-Antwort ({ ranks: [{date, rank}] }), sonst undefined. */
export function parseTrancoRanks(json: unknown): number | undefined {
  const ranks = (json as { ranks?: Array<{ date?: string; rank?: unknown }> } | null)?.ranks;
  if (!Array.isArray(ranks) || ranks.length === 0) return undefined;
  const latest = [...ranks]
    .filter((r) => typeof r.rank === 'number' && Number.isFinite(r.rank))
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))[0];
  return latest?.rank as number | undefined;
}

/** Erster Tag des vorletzten Monats (YYYY-MM-01) – sicher verfügbar, analog EAA. */
export function defaultDisplayDate(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function semrushGet(endpoint: string, params: Record<string, string>): Promise<SemrushRow[]> {
  const url = `${SEMRUSH_BASE}/${endpoint}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  if (!res.ok && !/^ERROR/i.test(text.trim())) throw new Error(`Semrush ${endpoint} HTTP ${res.status}`);
  return parseSemrushCsv(text);
}

async function fetchSemrush(domain: string, apiKey: string, notes: string[]): Promise<SemrushData | null> {
  const displayDate = defaultDisplayDate();
  const [summary, geo, pages] = await Promise.allSettled([
    semrushGet('summary', {
      key: apiKey,
      targets: domain,
      display_date: displayDate,
      export_columns:
        'target,display_date,visits,desktop_visits,mobile_visits,users,pages_per_visit,bounce_rate,time_on_site',
    }),
    semrushGet('geo', {
      key: apiKey,
      target: domain,
      target_type: 'domain',
      display_date: displayDate,
      geo_type: 'country',
      display_limit: String(TOP_LIMIT),
      sort_order: 'traffic_desc',
      export_columns: 'geo,traffic,traffic_share',
    }),
    semrushGet('toppages', {
      key: apiKey,
      target: domain,
      target_type: 'domain',
      display_date: displayDate,
      display_limit: String(TOP_LIMIT),
      sort_order: 'traffic_share_desc',
      export_columns: 'page,traffic_share',
    }),
  ]);

  if (summary.status === 'rejected') notes.push(`Semrush summary failed: ${errText(summary.reason)}`);
  if (geo.status === 'rejected') notes.push(`Semrush geo failed: ${errText(geo.reason)}`);
  if (pages.status === 'rejected') notes.push(`Semrush top pages failed: ${errText(pages.reason)}`);

  const base = summary.status === 'fulfilled' ? parseSemrushSummary(summary.value) : null;
  const topCountries = geo.status === 'fulfilled' ? parseSemrushGeo(geo.value) : [];
  const topPages = pages.status === 'fulfilled' ? parseSemrushTopPages(pages.value) : [];
  if (!base && topCountries.length === 0 && topPages.length === 0) {
    if (summary.status === 'fulfilled') notes.push(`Semrush: no traffic data for ${domain}`);
    return null;
  }
  return { displayDate, ...(base ?? {}), topCountries, topPages };
}

async function fetchTranco(domain: string): Promise<number | undefined> {
  const res = await fetch(`${TRANCO_BASE}/${encodeURIComponent(domain)}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (res.status === 429) throw new Error('rate limit exceeded (1 query/second)');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseTrancoRanks(await res.json());
}

export async function getTraffic(domainOrUrl: string): Promise<TrafficResult> {
  const domain = normalizeDomain(domainOrUrl);
  const notes: string[] = [];
  const result: TrafficResult = { domain, fetchedAt: new Date().toISOString(), sources: [] };
  const apiKey = process.env.SEMRUSH_API_KEY?.trim();

  const [semrush, tranco] = await Promise.allSettled([
    apiKey ? fetchSemrush(domain, apiKey, notes) : Promise.resolve(null),
    fetchTranco(domain),
  ]);

  if (!apiKey) notes.push('SEMRUSH_API_KEY not configured – visit metrics unavailable');
  if (semrush.status === 'fulfilled' && semrush.value) {
    result.semrush = semrush.value;
    result.sources.push('semrush');
  } else if (semrush.status === 'rejected') {
    notes.push(`Semrush failed: ${errText(semrush.reason)}`);
  }

  if (tranco.status === 'fulfilled') {
    if (tranco.value !== undefined) {
      result.trancoRank = tranco.value;
      result.sources.push('tranco');
    } else {
      notes.push(`Tranco: ${domain} not ranked in the top 1M`);
    }
  } else {
    notes.push(`Tranco failed: ${errText(tranco.reason)}`);
  }

  if (notes.length) result.notes = notes;
  return result;
}

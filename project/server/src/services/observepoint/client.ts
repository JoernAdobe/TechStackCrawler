import { config } from '../../config.js';
import { withRetry } from '../../utils/retry.js';

/**
 * Schlanker ObservePoint-REST-Client (https://api.observepoint.com, Header `Authorization: api_key <KEY>`).
 * Lesend live verifiziert: /v3/web-audits, /v2/domains, /v2/web-audits/{id}, /v2/web-audits/{id}/runs,
 * /v2/tags, /v3/web-audits/{a}/runs/{r}/reports/tag-inventory/tags[/{tagId}/accounts].
 * Insights (lesend, live verifiziert): GET runs/{r}/info, GET runs/{r}/pages/{p}/tags, POST runs/{r}/reports/
 * {page-summary[/pages], tag-health/tags, tag-duplicates-and-multiples/tags, browser-logs[/messages],
 * cookie-inventory[/cookies], request-privacy/compliance} sowie POST /v3/reports/grid/tags (Grid Reporting API).
 * Schreibend nur die im OP-Help-Center dokumentierten Calls (API Recipe "Update Audit Starting URLs"):
 * PUT /v2/web-audits/{id} und POST /v2/web-audits/{id}/runs.
 * Der API-Key wird nie geloggt oder in Fehlermeldungen übernommen.
 */

const TIMEOUT_MS = 30_000;
/** Kleinste von der Tag-Accounts-Route akzeptierte Seitengröße. */
const PAGE_SIZE = 100;

export class ObservePointError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** true = lokale Konfigurations-Sperre (kein Upstream-Status). */
    readonly local = false,
  ) {
    super(message);
    this.name = 'ObservePointError';
  }
}

export interface OpAuditSummary {
  auditId: number;
  auditName: string;
  folderId?: number;
  domainId?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface OpDomain {
  id: number;
  name?: string;
  domain?: string;
  folderId?: number;
}

export interface OpRun {
  id: number;
  webAuditId: number;
  started?: string;
  completed?: string | null;
  totalUrl?: number;
  taggedUrl?: number;
  limit?: number;
}

export interface OpRunTag {
  tagId: number;
  tagName: string;
  tagCategoryId?: number;
  tagCategoryName?: string;
  tagPresentPageCount: number;
  tagAbsentPageCount?: number;
  filteredTagAccountCount?: number;
}

export interface OpLibraryTag {
  id: number;
  name: string;
  category?: { id: number; name: string };
}

/** Vollständiges Audit-Objekt (GET /v2/web-audits/{id}); unbekannte Felder werden beim PUT unverändert zurückgegeben. */
export type OpAuditConfig = Record<string, unknown> & {
  id: number;
  name: string;
  domainId?: number;
  startingUrls?: string[];
  limit?: number;
  webAuditRunning?: boolean;
};

export function isObservePointConfigured(): boolean {
  return config.observepoint.apiKey.length > 0;
}

/** Nutzerlesbare (englische) Meldung je Upstream-Status – ohne Upstream-Body, nie mit API-Key. */
function statusMessage(status: number): string {
  if (status === 401) return 'ObservePoint rejected the API key (HTTP 401) – check OBSERVEPOINT_API_KEY.';
  if (status === 403) return 'The ObservePoint API key has no access to this resource (HTTP 403).';
  if (status === 404) return 'ObservePoint resource not found (HTTP 404).';
  if (status === 429) return 'ObservePoint rate limit reached (HTTP 429) – please try again in a minute.';
  if (status >= 500) return `ObservePoint is temporarily unavailable (HTTP ${status}) – please try again later.`;
  return `ObservePoint request failed (HTTP ${status}).`;
}

/** Lesende Calls (GET + Report-Abfragen per POST) sind idempotent und dürfen wiederholt werden. */
function isIdempotent(method: string, path: string): boolean {
  return method === 'GET' || (method === 'POST' && path.includes('/reports/'));
}

async function requestOnce<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  const route = `${method} ${path.split('?')[0]}`;
  let res: Response;
  try {
    res = await fetch(`${config.observepoint.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `api_key ${config.observepoint.apiKey}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timeout = err instanceof Error && err.name === 'TimeoutError';
    console.warn(`[observepoint] ${route}: ${timeout ? 'timeout' : 'network error'}`);
    throw new ObservePointError(
      timeout ? `ObservePoint did not respond within ${TIMEOUT_MS / 1000} s.` : 'ObservePoint is unreachable (network error).',
      timeout ? 504 : 503,
    );
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ');
    console.warn(`[observepoint] ${route}: HTTP ${res.status} ${detail}`.trim());
    throw new ObservePointError(statusMessage(res.status), res.status);
  }
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    console.warn(`[observepoint] ${route}: invalid JSON response`);
    throw new ObservePointError('ObservePoint returned an unreadable response.', 502);
  }
}

async function request<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  if (!isObservePointConfigured()) throw new ObservePointError('OBSERVEPOINT_API_KEY is not set.', 503);
  if (!isIdempotent(method, path)) return requestOnce<T>(method, path, body);
  return withRetry(() => requestOnce<T>(method, path, body), {
    attempts: 3,
    baseDelayMs: Number.parseInt(process.env.OBSERVEPOINT_RETRY_BASE_MS ?? '1000', 10) || 0,
    maxDelayMs: 8_000,
    shouldRetry: (err) => {
      const status = err instanceof ObservePointError ? err.status : undefined;
      return status === 429 || status === 503 || status === 504 || (status !== undefined && status >= 500);
    },
  });
}

// ── Caches (prozesslokal) ─────────────────────────────────────────────────
interface CacheEntry<T> {
  at: number;
  value: Promise<T>;
}
const caches = new Map<string, CacheEntry<unknown>>();

function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = caches.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = load();
  caches.set(key, { at: Date.now(), value });
  // Fehler nicht cachen.
  value.catch(() => caches.delete(key));
  return value;
}

export function clearObservePointCache(): void {
  caches.clear();
}

const MIN = 60_000;

export const listAudits = () => cached('audits', 10 * MIN, () => request<OpAuditSummary[]>('GET', '/v3/web-audits'));
export const listDomains = () => cached('domains', 60 * MIN, () => request<OpDomain[]>('GET', '/v2/domains'));
export const getTagLibrary = () => cached('library', 24 * 60 * MIN, () => request<OpLibraryTag[]>('GET', '/v2/tags'));

export const getAudit = (auditId: number) => request<OpAuditConfig>('GET', `/v2/web-audits/${auditId}`);
export const listRuns = (auditId: number) => request<OpRun[]>('GET', `/v2/web-audits/${auditId}/runs`);

/** Alle Tags eines Runs (Tag-Inventory-Report, seitenweise). */
export async function getRunTags(auditId: number, runId: number): Promise<OpRunTag[]> {
  const all: OpRunTag[] = [];
  for (let page = 0; page < 20; page++) {
    const res = await request<{ tags?: OpRunTag[] }>(
      'POST',
      `/v3/web-audits/${auditId}/runs/${runId}/reports/tag-inventory/tags?page=${page}&size=${PAGE_SIZE}`,
      {},
    );
    const tags = res?.tags ?? [];
    all.push(...tags);
    if (tags.length < PAGE_SIZE) break;
  }
  return all;
}

/** Tag-Accounts (Report-Suite, Measurement-ID, …) eines Tags in einem Run – erste Seite reicht für die Matrix. */
export async function getTagAccounts(auditId: number, runId: number, tagId: number): Promise<string[]> {
  const res = await request<{ tagAccounts?: Array<{ tagAccount?: string }> }>(
    'POST',
    `/v3/web-audits/${auditId}/runs/${runId}/reports/tag-inventory/tags/${tagId}/accounts?page=0&size=${PAGE_SIZE}`,
    {},
  );
  return (res?.tagAccounts ?? []).map((a) => String(a.tagAccount ?? '').trim()).filter(Boolean);
}

// ── Run-Reports für Insights (alle lesend, Pfade laut docs/observepoint-api-audit.md) ─
export interface OpRunInfo {
  privacyConsentActions?: boolean;
  gpcEnabled?: boolean;
  blockThirdPartyCookies?: boolean;
  urlsScanned?: number;
}

export interface OpPageSummary {
  averagePageLoadTime?: number;
  webVitals?: {
    p75LargestContentfulPaint?: number;
    p75FirstContentfulPaint?: number;
    p75TimeToFirstByte?: number;
    p75CumulativeLayoutShift?: number;
  };
}

export interface OpPageSummaryPage {
  pageId: string;
  pageUrl?: string;
  finalPageUrl?: string;
}

export interface OpPageTagInstance {
  account?: string | null;
  loadTime?: number;
  statusCode?: number;
  tagInstanceVariables?: Array<{ name: string; value: string }>;
}

export interface OpPageTags {
  pageTags?: Array<{ name: string; category?: string; tagId?: number; pageTagInstances?: OpPageTagInstance[] }>;
}

export interface OpLoadTimeDistribution {
  below500?: number;
  '500to1000'?: number;
  '1000to2000'?: number;
  above2000?: number;
}

export interface OpTagHealthTag {
  tagId: number;
  tagName: string;
  tagInstanceCount?: number;
  tagLoadTimeDistribution?: OpLoadTimeDistribution;
  tagStatusCodeDistribution?: { good?: number; redirect?: number; broken?: number };
}

export interface OpTagDuplicateTag {
  tagId: number;
  tagName: string;
  filteredTagDuplicateCount?: number;
  filteredTagDuplicatePageCount?: number;
  filteredTagMultipleCount?: number;
}

export interface OpBrowserLogSummary {
  errorLogCount?: number;
  warnLogCount?: number;
}

export interface OpBrowserLogMessage {
  level: string;
  message: string;
  logCount?: number;
  pageCount?: number;
  relatedTag?: { tagId?: number; tagName?: string };
}

export interface OpCookieSummary {
  filteredUniqueCookieCount?: number;
  filteredFirstPartyCookieCount?: number;
  filteredThirdPartyCookieCount?: number;
  filteredNonSecureCookieCount?: number;
  filteredSameSiteEmptyCookieCount?: number;
}

export interface OpCookie {
  name: string;
  domain: string;
  partyType?: string;
  maxDurationInMinutes?: number | null;
  initiatorTagIds?: number[];
}

export interface OpRequestCompliance {
  requestDomain: string;
  requestGeo?: { countryCode?: string; countryName?: string };
  requestCount?: number;
}

/** Grid-Antwort: Zeilen als Arrays, Spaltenreihenfolge über metadata.headers. */
export interface OpGridResponse {
  metadata?: {
    headers?: Array<{ column: { columnId?: string; aggregateFunction?: string; aggregatedColumn?: { columnId: string } } }>;
  };
  rows?: unknown[][];
}

const run = (auditId: number, runId: number) => `/v3/web-audits/${auditId}/runs/${runId}`;
const paged = `?page=0&size=${PAGE_SIZE}`;

export const getRunInfo = (a: number, r: number) => request<OpRunInfo>('GET', `${run(a, r)}/info`);
export const getPageSummary = (a: number, r: number) => request<OpPageSummary>('POST', `${run(a, r)}/reports/page-summary`, {});
export const getPageSummaryPages = (a: number, r: number) =>
  request<{ pages?: OpPageSummaryPage[] }>('POST', `${run(a, r)}/reports/page-summary/pages${paged}`, {});
export const getPageTags = (a: number, r: number, pageId: string) =>
  request<OpPageTags>('GET', `${run(a, r)}/pages/${encodeURIComponent(pageId)}/tags?getInsights=true`);
export const getTagHealthTags = (a: number, r: number) =>
  request<{ tags?: OpTagHealthTag[] }>('POST', `${run(a, r)}/reports/tag-health/tags${paged}`, {});
export const getTagDuplicateTags = (a: number, r: number) =>
  request<{ tags?: OpTagDuplicateTag[] }>('POST', `${run(a, r)}/reports/tag-duplicates-and-multiples/tags${paged}`, {});
export const getBrowserLogSummary = (a: number, r: number) =>
  request<OpBrowserLogSummary>('POST', `${run(a, r)}/reports/browser-logs`, {});
export const getBrowserLogMessages = (a: number, r: number) =>
  request<{ messages?: OpBrowserLogMessage[] }>('POST', `${run(a, r)}/reports/browser-logs/messages${paged}`, {});
export const getCookieSummary = (a: number, r: number) =>
  request<OpCookieSummary>('POST', `${run(a, r)}/reports/cookie-inventory`, {});
export const getCookies = (a: number, r: number) =>
  request<{ cookies?: OpCookie[] }>('POST', `${run(a, r)}/reports/cookie-inventory/cookies${paged}`, {});
export const getRequestCompliance = (a: number, r: number) =>
  request<{ requests?: OpRequestCompliance[] }>('POST', `${run(a, r)}/reports/request-privacy/compliance${paged}`, {});

/**
 * Grid Reporting API: Tags eines Runs gruppiert nach Tag und Version, mit Seitenzahl und Median-Ladezeit.
 * Live verifiziert (Filter AUDIT_ID + AUDIT_RUN_ID, Spalte TAG liefert [name, id]).
 */
export const getRunTagVersionsGrid = (a: number, r: number) =>
  request<OpGridResponse>('POST', '/v3/reports/grid/tags', {
    columns: [
      { columnId: 'TAG', groupBy: true },
      { columnId: 'TAG_VERSION', groupBy: true },
      { aggregateFunction: 'count_distinct', aggregatedColumn: { columnId: 'PAGE_ID' } },
      { aggregateFunction: 'median', aggregatedColumn: { columnId: 'TAG_DURATION' } },
    ],
    filters: {
      conditionMatchMode: 'all',
      conditions: [
        { operator: 'integer_in', args: [a], negated: false, filteredColumn: { columnId: 'AUDIT_ID' } },
        { operator: 'integer_in', args: [r], negated: false, filteredColumn: { columnId: 'AUDIT_RUN_ID' } },
      ],
    },
    sortBy: [{ columnIndex: 2, sortDesc: true }],
    page: 0,
    size: 500,
  });

// ── Schreibend (nur über Opt-in OBSERVEPOINT_ALLOW_CREATE=1 erreichbar) ───
export const updateAudit = (audit: OpAuditConfig) => request<OpAuditConfig>('PUT', `/v2/web-audits/${audit.id}`, audit);
export const startRun = (auditId: number) => request<Partial<OpRun> | undefined>('POST', `/v2/web-audits/${auditId}/runs`, {});

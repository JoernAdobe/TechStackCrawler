import { config } from '../../config.js';
import type { ObservePointInsights, ObservePointResult, ObservePointTag } from '../../types/parity.js';
import { normalizeDomain } from '../traffic.js';
import { isIgnoredOpTag } from './canonicalNames.js';
import {
  ObservePointError,
  getAudit,
  getRunTags,
  getTagAccounts,
  listAudits,
  listDomains,
  listRuns,
  startRun,
  updateAudit,
  type OpAuditSummary,
  type OpDomain,
  type OpRun,
  type OpRunTag,
} from './client.js';
import { fetchRunInsights } from './insights.js';

/**
 * ObservePoint als zweite Erkennungsquelle.
 * - reuse (Default, kostenlos): bestehende Audits im geteilten Account (u. a. EAA-Ordner "WebAudits") für die
 *   Domain suchen und den jüngsten abgeschlossenen Run auslesen.
 * - fresh (Opt-in OBSERVEPOINT_ALLOW_CREATE=1): eigenes Scratch-Audit per PUT auf die URL umstellen und starten;
 *   Ergebnis wird beim nächsten reuse-Abruf gelesen, sobald der Run fertig ist.
 */

const MAX_CANDIDATE_AUDITS = 5;
const MAX_ACCOUNT_LOOKUPS = 60;
const ACCOUNT_CONCURRENCY = 6;
const DAY_MS = 86_400_000;

export type ObservePointMode = 'reuse' | 'fresh';

/** Hostname aus einem Audit-/Domain-Namen, falls er wie eine URL oder ein Host aussieht. */
function hostOf(value: string | undefined): string | undefined {
  const v = (value ?? '').trim();
  if (!v || /\s/.test(v) || !/\.[a-z]{2,}/i.test(v)) return undefined;
  const host = normalizeDomain(v);
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : undefined;
}

function matchesDomain(host: string | undefined, domain: string): 0 | 1 | 2 {
  if (!host) return 0;
  if (host === domain) return 2;
  return host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`) ? 1 : 0;
}

/** Kandidaten-Audits für eine Domain: exakte Treffer vor Subdomains, jeweils jüngste zuerst. */
export function findAuditsForDomain(domain: string, audits: OpAuditSummary[], domains: OpDomain[]): OpAuditSummary[] {
  const target = normalizeDomain(domain);
  const domainHost = new Map<number, string | undefined>();
  for (const d of domains) domainHost.set(d.id, hostOf(d.domain) ?? hostOf(d.name));
  const scored: Array<{ audit: OpAuditSummary; score: number }> = [];
  for (const audit of audits) {
    const byName = matchesDomain(hostOf(audit.auditName), target);
    const byDomain = audit.domainId !== undefined ? matchesDomain(domainHost.get(audit.domainId), target) : 0;
    const score = Math.max(byName, byDomain);
    if (score > 0) scored.push({ audit, score });
  }
  const ts = (a: OpAuditSummary) => Date.parse(a.updatedAt ?? a.createdAt ?? '') || 0;
  return scored.sort((a, b) => b.score - a.score || ts(b.audit) - ts(a.audit)).map((s) => s.audit);
}

/** Jüngster abgeschlossener Run innerhalb des Alterslimits bzw. Info, ob gerade einer läuft. */
export function pickRun(runs: OpRun[], maxAgeDays: number, now = Date.now()): { run?: OpRun; running: boolean } {
  const sorted = [...runs].sort((a, b) => (Date.parse(b.started ?? '') || 0) - (Date.parse(a.started ?? '') || 0));
  const running = sorted.length > 0 && !sorted[0]!.completed;
  const run = sorted.find((r) => r.completed && now - Date.parse(r.completed) <= maxAgeDays * DAY_MS);
  return { run, running };
}

/** OP-Run-Tags → Ergebnis-Tags (ohne Hilfs-Tags, nur tatsächlich gefeuerte). */
export function toObservePointTags(tags: OpRunTag[]): ObservePointTag[] {
  return tags
    .filter((t) => t.tagPresentPageCount > 0 && !isIgnoredOpTag(t.tagName))
    .map((t) => ({
      tagId: t.tagId,
      name: t.tagName,
      category: t.tagCategoryName ?? 'Other',
      pagesPresent: t.tagPresentPageCount,
    }))
    .sort((a, b) => b.pagesPresent - a.pagesPresent || a.name.localeCompare(b.name));
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

async function readRun(auditId: number, run: OpRun): Promise<{ tags: ObservePointTag[]; raw: OpRunTag[] }> {
  const raw = await getRunTags(auditId, run.id);
  const tags = toObservePointTags(raw);
  const withAccounts = new Set(raw.filter((t) => (t.filteredTagAccountCount ?? 0) > 0).map((t) => t.tagId));
  const lookups = tags.filter((t) => withAccounts.has(t.tagId)).slice(0, MAX_ACCOUNT_LOOKUPS);
  await mapLimit(lookups, ACCOUNT_CONCURRENCY, async (tag) => {
    try {
      const accounts = await getTagAccounts(auditId, run.id, tag.tagId);
      if (accounts.length) tag.accounts = [...new Set(accounts)].slice(0, 10);
    } catch {
      // Accounts sind optional; ein Fehler hier soll das Ergebnis nicht kippen.
    }
  });
  return { tags, raw };
}

/** Insights sind Zusatz: Ein Totalausfall darf das Tag-Ergebnis nicht kippen. */
async function readInsights(auditId: number, run: OpRun, raw: OpRunTag[]): Promise<ObservePointInsights> {
  try {
    return await fetchRunInsights(auditId, run, raw);
  } catch (err) {
    return {
      generatedAt: new Date().toISOString(),
      runCompletedAt: run.completed ?? undefined,
      pages: run.totalUrl,
      versions: null,
      adobeFootprint: null,
      quality: null,
      privacy: null,
      findings: [],
      notes: [`Insights unavailable: ${err instanceof Error ? err.message : 'unknown error'}`],
    };
  }
}

function base(url: string, domain: string, status: ObservePointResult['status'], reused: boolean): ObservePointResult {
  return { url, domain, fetchedAt: new Date().toISOString(), status, reused, tags: [] };
}

async function reuse(url: string, domain: string): Promise<ObservePointResult> {
  const [audits, domains] = await Promise.all([listAudits(), listDomains()]);
  const candidates = findAuditsForDomain(domain, audits, domains).slice(0, MAX_CANDIDATE_AUDITS);
  const scratchId = config.observepoint.scratchAuditId;
  if (!candidates.length) {
    return {
      ...base(url, domain, 'not_found', true),
      note: 'No ObservePoint audit found for this domain in the account.',
    };
  }

  let best: { audit: OpAuditSummary; run: OpRun } | undefined;
  let running: OpAuditSummary | undefined;
  for (const audit of candidates) {
    const runs = await listRuns(audit.auditId);
    // Beim Scratch-Audit gehört nur der jüngste Run zur aktuellen Ziel-URL.
    const scoped = audit.auditId === scratchId ? runs.slice().sort((a, b) => b.id - a.id).slice(0, 1) : runs;
    const pick = pickRun(scoped, config.observepoint.maxRunAgeDays);
    if (pick.running && !running) running = audit;
    if (pick.run && (!best || Date.parse(pick.run.completed!) > Date.parse(best.run.completed!))) {
      best = { audit, run: pick.run };
    }
  }

  if (!best) {
    return running
      ? {
          ...base(url, domain, 'running', true),
          auditId: running.auditId,
          auditName: running.auditName,
          note: 'ObservePoint run still in progress – please check again later.',
        }
      : {
          ...base(url, domain, 'not_found', true),
          note: `Audits exist, but no completed run in the last ${config.observepoint.maxRunAgeDays} days.`,
        };
  }

  return resultFromRun(url, domain, best.audit, best.run, best.audit.auditId !== scratchId);
}

/** Abgeschlossenen Run vollständig auslesen (Tags, Accounts, Insights). */
export async function resultFromRun(
  url: string,
  domain: string,
  audit: Pick<OpAuditSummary, 'auditId' | 'auditName'>,
  run: OpRun,
  reused: boolean,
): Promise<ObservePointResult> {
  const { tags, raw } = await readRun(audit.auditId, run);
  const insights = await readInsights(audit.auditId, run, raw);
  return {
    ...base(url, domain, 'done', reused),
    auditId: audit.auditId,
    auditName: audit.auditName,
    runId: run.id,
    runCompletedAt: run.completed ?? undefined,
    pagesScanned: run.totalUrl,
    tags,
    insights,
  };
}

/** Regex wie in den EAA-Audits: Host und Subdomains der Ziel-Domain. */
export function includeFilterFor(domain: string): string {
  return `^https?://([^/:\\?]*\\.)?${domain.replace(/\./g, '\\.')}([^.]|$)`;
}

export async function startFreshScan(url: string, domain: string): Promise<ObservePointResult> {
  const { allowCreate, scratchAuditId, maxPages } = config.observepoint;
  if (!allowCreate) {
    throw new ObservePointError('Fresh ObservePoint scans are disabled (set OBSERVEPOINT_ALLOW_CREATE=1).', 403, true);
  }
  if (!scratchAuditId) {
    throw new ObservePointError('OBSERVEPOINT_SCRATCH_AUDIT_ID is missing (create a dedicated audit in the ObservePoint UI).', 400, true);
  }
  const audit = await getAudit(scratchAuditId);
  if (audit.webAuditRunning) {
    return {
      ...base(url, domain, 'running', false),
      auditId: audit.id,
      auditName: audit.name,
      note: 'The scratch audit is currently busy – please try again in a few minutes.',
    };
  }
  await updateAudit({
    ...audit,
    // Name = URL, damit der reuse-Abruf das Audit über den Namen der Domain zuordnet.
    name: url,
    startingUrls: [url],
    limit: maxPages,
    filters: { include: [{ value: includeFilterFor(domain), includeLimit: 0 }], exclude: [] },
  });
  const run = await startRun(audit.id);
  return {
    ...base(url, domain, 'running', false),
    auditId: audit.id,
    auditName: url,
    runId: typeof run?.id === 'number' ? run.id : undefined,
    note: `ObservePoint scan started (max. ${maxPages} pages) – check back in a few minutes.`,
  };
}

export async function getObservePoint(url: string, mode: ObservePointMode = 'reuse'): Promise<ObservePointResult> {
  const domain = normalizeDomain(url);
  return mode === 'fresh' ? startFreshScan(url, domain) : reuse(url, domain);
}

export { ObservePointError, isObservePointConfigured } from './client.js';

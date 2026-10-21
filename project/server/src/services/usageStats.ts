/**
 * Management-KPIs jenseits der reinen Analyse-Zahlen: Nutzer & Aktivität
 * (usage_events), Pre-Briefings, Batches, Feedback, Zuverlässigkeit, Funnel.
 */
import type { DbHandle } from '../db/types.js';
import { listUsageEvents, type UsageEventRow } from '../db/usageEvents.js';
import { SYSTEM_VISITORS } from './usageTracking.js';

const DAY_MS = 86_400_000;
const EXPORT_EVENTS = new Set([
  'export_pdf', 'export_briefing_pdf', 'export_briefing_html', 'export_deck', 'export_batch', 'export_markdown', 'export_excel',
]);

export interface NamedCount { name: string; count: number }
export interface UserWeek { week: string; activeUsers: number; newUsers: number; returningUsers: number }

export interface FunnelInput { analysisId: number; domain: string; hasUseCases: boolean; hasGeo: boolean }

export interface UsageStats {
  trackingSince: string | null;
  users: {
    total: number;
    dau: number;
    wau: number;
    mau: number;
    /** Ø täglich aktive Nutzer der letzten 30 Tage. */
    avgDau30: number;
    /** Stickiness = Ø DAU / MAU in % (wie oft kommen aktive Nutzer wieder). */
    stickiness: number | null;
    /** Nutzer, die an ≥ 2 verschiedenen Tagen da waren. */
    returning: number;
    returnRate: number | null;
    /** Power-User: an ≥ 5 verschiedenen Tagen aktiv. */
    powerUsers: number;
    /** Anteil der Nutzer der Vorwoche, die diese Woche wieder aktiv sind (%). */
    weeklyRetention: number | null;
    newLast30d: number;
    visits: number;
    visitsLast30d: number;
    avgVisitsPerUser: number;
    avgActiveDaysPerUser: number;
    avgActionsPerUser: number;
    /** Anteil der Besuche mit mindestens einer echten Aktion (%). */
    usageRate: number | null;
  };
  usersPerWeek: UserWeek[];
  featureUsage: Array<{ name: string; total: number; last30d: number }>;
  exports: { total: number; last30d: number };
  integrations: { rfpContext: number; mcpCalls: number };
  topUsers: Array<{ label: string; actions: number; activeDays: number; visits: number; lastSeen: string }>;
  briefings: {
    total: number;
    done: number;
    failed: number;
    inProgress: number;
    accounts: number;
    creators: number;
    avgMinutes: number | null;
    perWeek: NamedCount[];
  };
  batches: { total: number; items: number };
  feedback: { total: number; avgRating: number | null };
  reliability: { runsLast30d: number; failedLast30d: number; successRate: number | null };
  funnel: { accounts: number; withUseCases: number; withGeo: number; withBriefing: number; exported: number };
}

export function weekKey(ms: number): string {
  // ISO-Woche (Montag-basiert)
  const d = new Date(ms);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function toMs(v: unknown): number | null {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  const s = String(v);
  const ms = Date.parse(s.includes('T') || s.endsWith('Z') ? s : `${s.replace(' ', 'T')}Z`);
  return Number.isNaN(ms) ? null : ms;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Reine Aggregation über die Events (testbar ohne DB). Admin-Besucher werden ausgeschlossen. */
export function aggregateUsage(events: UsageEventRow[], now: number, adminEmails: string[] = []) {
  const admins = new Set(adminEmails.map((e) => e.toLowerCase()));
  const adminVisitors = new Set(events.filter((e) => e.email && admins.has(e.email.toLowerCase())).map((e) => e.visitor_id));
  const tracked = events.filter((e) => !adminVisitors.has(e.visitor_id) && !(e.email && admins.has(e.email.toLowerCase())));
  const humans = tracked.filter((e) => !SYSTEM_VISITORS.has(e.visitor_id) && e.status < 400);

  const firstSeen = new Map<string, number>();
  const lastSeen = new Map<string, number>();
  const days = new Map<string, Set<string>>();
  const actions = new Map<string, number>();
  const visits = new Map<string, number>();
  const weekActive = new Map<string, Set<string>>();
  const weekNew = new Map<string, number>();
  const dayActive = new Map<string, Set<string>>();
  // Besuch → hatte er eine Aktion? (Aktion bis zum nächsten Besuch desselben Nutzers)
  let visitCount = 0;
  let visitsLast30 = 0;
  let visitsWithAction = 0;
  const openVisit = new Map<string, boolean>();

  for (const e of humans) {
    const v = e.visitor_id;
    if (!firstSeen.has(v)) {
      firstSeen.set(v, e.ts_ms);
      const wk = weekKey(e.ts_ms);
      weekNew.set(wk, (weekNew.get(wk) ?? 0) + 1);
    }
    lastSeen.set(v, e.ts_ms);
    const day = new Date(e.ts_ms).toISOString().slice(0, 10);
    if (!days.has(v)) days.set(v, new Set());
    days.get(v)!.add(day);
    if (!dayActive.has(day)) dayActive.set(day, new Set());
    dayActive.get(day)!.add(v);
    const wk = weekKey(e.ts_ms);
    if (!weekActive.has(wk)) weekActive.set(wk, new Set());
    weekActive.get(wk)!.add(v);

    if (e.event === 'visit') {
      if (openVisit.get(v)) visitsWithAction++;
      openVisit.set(v, false);
      visits.set(v, (visits.get(v) ?? 0) + 1);
      visitCount++;
      if (e.ts_ms >= now - 30 * DAY_MS) visitsLast30++;
    } else {
      actions.set(v, (actions.get(v) ?? 0) + 1);
      if (openVisit.has(v)) openVisit.set(v, true);
    }
  }
  for (const had of openVisit.values()) if (had) visitsWithAction++;

  const people = firstSeen.size;
  const activeSince = (ms: number) => [...lastSeen.values()].filter((t) => t >= now - ms).length;
  const activeBetween = (from: number, to: number) => {
    const set = new Set<string>();
    for (const e of humans) if (e.ts_ms >= from && e.ts_ms < to) set.add(e.visitor_id);
    return set;
  };
  const sum = (it: Iterable<number>) => [...it].reduce((a, b) => a + b, 0);

  let dauSum = 0;
  const firstTracked = humans.length ? humans[0].ts_ms : now;
  const window = Math.min(30, Math.max(1, Math.ceil((now - firstTracked) / DAY_MS)));
  for (let i = 0; i < window; i++) {
    const day = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
    dauSum += dayActive.get(day)?.size ?? 0;
  }
  const mau = activeSince(30 * DAY_MS);
  const avgDau30 = round1(dauSum / window);
  const prevWeek = activeBetween(now - 14 * DAY_MS, now - 7 * DAY_MS);
  const thisWeek = activeBetween(now - 7 * DAY_MS, now + 1);
  const retained = [...prevWeek].filter((v) => thisWeek.has(v)).length;
  const returning = [...days.values()].filter((d) => d.size >= 2).length;

  const feature = new Map<string, { total: number; last30d: number }>();
  for (const e of tracked) {
    if (e.status >= 400 || e.event === 'visit') continue;
    const f = feature.get(e.event) ?? { total: 0, last30d: 0 };
    f.total++;
    if (e.ts_ms >= now - 30 * DAY_MS) f.last30d++;
    feature.set(e.event, f);
  }
  const exportsAll = [...feature.entries()].filter(([k]) => EXPORT_EVENTS.has(k));

  const topUsers = [...firstSeen.keys()]
    .map((v) => ({ v, actions: actions.get(v) ?? 0, days: days.get(v)?.size ?? 0 }))
    .filter((u) => u.actions > 0 || u.days > 1)
    .sort((a, b) => b.actions - a.actions || b.days - a.days)
    .slice(0, 10)
    .map(({ v, actions: n, days: d }) => ({
      label: `User ${v.slice(0, 6)}`,
      actions: n,
      activeDays: d,
      visits: visits.get(v) ?? 0,
      lastSeen: new Date(lastSeen.get(v)!).toISOString(),
    }));

  const usersPerWeek: UserWeek[] = [...weekActive.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, set]) => {
      const fresh = weekNew.get(week) ?? 0;
      return { week, activeUsers: set.size, newUsers: fresh, returningUsers: set.size - fresh };
    });

  return {
    trackingSince: tracked.length ? new Date(tracked[0].ts_ms).toISOString() : null,
    users: {
      total: people,
      dau: activeSince(DAY_MS),
      wau: activeSince(7 * DAY_MS),
      mau,
      avgDau30,
      stickiness: mau ? Math.round((avgDau30 / mau) * 100) : null,
      returning,
      returnRate: people ? Math.round((returning / people) * 100) : null,
      powerUsers: [...days.values()].filter((d) => d.size >= 5).length,
      weeklyRetention: prevWeek.size ? Math.round((retained / prevWeek.size) * 100) : null,
      newLast30d: [...firstSeen.values()].filter((t) => t >= now - 30 * DAY_MS).length,
      visits: visitCount,
      visitsLast30d: visitsLast30,
      avgVisitsPerUser: people ? round1(visitCount / people) : 0,
      avgActiveDaysPerUser: people ? round1(sum([...days.values()].map((d) => d.size)) / people) : 0,
      avgActionsPerUser: people ? round1(sum(actions.values()) / people) : 0,
      usageRate: visitCount ? Math.round((visitsWithAction / visitCount) * 100) : null,
    },
    usersPerWeek,
    featureUsage: [...feature.entries()].map(([name, f]) => ({ name, ...f })).sort((a, b) => b.total - a.total),
    exports: {
      total: sum(exportsAll.map(([, f]) => f.total)),
      last30d: sum(exportsAll.map(([, f]) => f.last30d)),
    },
    integrations: { rfpContext: feature.get('rfp_context')?.total ?? 0, mcpCalls: feature.get('mcp_call')?.total ?? 0 },
    topUsers,
    exportedAnalysisIds: new Set(tracked.filter((e) => EXPORT_EVENTS.has(e.event) && e.analysis_id != null && e.status < 400).map((e) => e.analysis_id!)),
  };
}

async function rows<T>(db: DbHandle, sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    const { rows: r } = await db.execute(sql, params);
    return r as T[];
  } catch {
    return []; // Tabelle fehlt (ältere DB) → KPI bleibt 0
  }
}

export async function computeUsageStats(db: DbHandle, funnelInput: FunnelInput[], adminEmails: string[] = [], now = Date.now()): Promise<UsageStats> {
  const events = await listUsageEvents(db, now - 400 * DAY_MS).catch(() => [] as UsageEventRow[]);
  const { exportedAnalysisIds, ...usage } = aggregateUsage(events, now, adminEmails);

  const jobs = await rows<{ analysis_id: number; status: string; created_by: string | null; created_at: unknown; started_at: unknown; finished_at: unknown }>(
    db, 'SELECT analysis_id, status, created_by, created_at, started_at, finished_at FROM briefing_jobs',
  );
  const done = jobs.filter((j) => j.status === 'done');
  const durations = done
    .map((j) => { const s = toMs(j.started_at); const f = toMs(j.finished_at); return s && f && f > s ? (f - s) / 60000 : null; })
    .filter((n): n is number => n != null);
  const briefingWeeks = new Map<string, number>();
  for (const j of jobs) {
    const ms = toMs(j.created_at);
    if (ms) briefingWeeks.set(weekKey(ms), (briefingWeeks.get(weekKey(ms)) ?? 0) + 1);
  }
  const briefedAnalysisIds = new Set(done.map((j) => Number(j.analysis_id)));

  const [batchRow] = await rows<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM batches');
  const [itemRow] = await rows<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM batch_items');
  const [fbRow] = await rows<{ n: number; avg: number | null }>(db, 'SELECT COUNT(*) AS n, AVG(rating) AS avg FROM feedback');
  const runs = await rows<{ status: string }>(db, 'SELECT status FROM analysis_runs WHERE created_ms >= ?', [now - 30 * DAY_MS]);
  const finishedRuns = runs.filter((r) => r.status !== 'running');
  const failedRuns = finishedRuns.filter((r) => r.status === 'error').length;

  const accounts = new Set<string>();
  const withUc = new Set<string>();
  const withGeo = new Set<string>();
  const withBriefing = new Set<string>();
  const exported = new Set<string>();
  for (const a of funnelInput) {
    accounts.add(a.domain);
    if (a.hasUseCases) withUc.add(a.domain);
    if (a.hasGeo) withGeo.add(a.domain);
    if (briefedAnalysisIds.has(a.analysisId)) withBriefing.add(a.domain);
    if (exportedAnalysisIds.has(a.analysisId)) exported.add(a.domain);
  }

  return {
    ...usage,
    briefings: {
      total: jobs.length,
      done: done.length,
      failed: jobs.filter((j) => j.status === 'error').length,
      inProgress: jobs.filter((j) => j.status === 'queued' || j.status === 'running').length,
      accounts: briefedAnalysisIds.size,
      creators: new Set(jobs.map((j) => j.created_by?.toLowerCase()).filter(Boolean)).size,
      avgMinutes: durations.length ? round1(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      perWeek: [...briefingWeeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count })),
    },
    batches: { total: Number(batchRow?.n ?? 0), items: Number(itemRow?.n ?? 0) },
    feedback: { total: Number(fbRow?.n ?? 0), avgRating: fbRow?.avg != null ? round1(Number(fbRow.avg)) : null },
    reliability: {
      runsLast30d: finishedRuns.length,
      failedLast30d: failedRuns,
      successRate: finishedRuns.length ? Math.round(((finishedRuns.length - failedRuns) / finishedRuns.length) * 100) : null,
    },
    funnel: { accounts: accounts.size, withUseCases: withUc.size, withGeo: withGeo.size, withBriefing: withBriefing.size, exported: exported.size },
  };
}

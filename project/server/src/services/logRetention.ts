/**
 * Täglicher Log-Purge (OneTrust-PIA): löscht Nutzungs- und Lauf-Logs älter als
 * RETENTION_LOG_DAYS (Default 30). Vorher werden für usageStats anonyme Wochen-Aggregate
 * (usage_weekly) gesichert – jede Woche genau einmal, solange ihre Events noch vollständig sind.
 */
import type { DbHandle } from '../db/types.js';
import { deleteUsageEventsBefore, insertUsageWeeklyIfAbsent, listUsageEvents } from '../db/usageEvents.js';
import { weekStartMs, weeklyUsageRows } from './usageStats.js';

const DAY_MS = 86_400_000;
/** Mindestens eine Woche: so ist jede zu archivierende Woche bereits abgeschlossen. */
export const MIN_RETENTION_DAYS = 7;

export interface PurgeResult {
  cutoffMs: number;
  archivedWeeks: string[];
  deletedUsageEvents: number;
  deletedAnalysisRuns: number;
}

export async function purgeExpiredLogs(
  db: DbHandle,
  opts: { retentionDays: number; adminEmails?: string[]; now?: number },
): Promise<PurgeResult> {
  const now = opts.now ?? Date.now();
  const cutoffMs = now - Math.max(MIN_RETENTION_DAYS, opts.retentionDays) * DAY_MS;

  // Alle Wochen archivieren, die ab jetzt (teilweise) gelöscht werden. Wird eine Woche erstmals
  // erfasst, wurde aus ihr noch nichts gelöscht (frühere Cutoffs lagen vor ihrem Start).
  const events = await listUsageEvents(db, 0);
  const archivedWeeks: string[] = [];
  for (const w of weeklyUsageRows(events, opts.adminEmails ?? [])) {
    if (weekStartMs(w.first_ts_ms) >= cutoffMs) continue;
    if (await insertUsageWeeklyIfAbsent(db, w, now)) archivedWeeks.push(w.week);
  }

  const deletedUsageEvents = await deleteUsageEventsBefore(db, cutoffMs);
  let deletedAnalysisRuns = 0;
  try {
    const { affectedRows } = await db.execute(`DELETE FROM analysis_runs WHERE updated_ms < ? AND status <> 'running'`, [cutoffMs]);
    deletedAnalysisRuns = Number(affectedRows ?? 0);
  } catch {
    // Tabelle fehlt (ältere DB)
  }
  return { cutoffMs, archivedWeeks, deletedUsageEvents, deletedAnalysisRuns };
}

/** Startet den Purge kurz nach dem Boot und danach alle 24 h. */
export function startLogRetention(
  getDb: () => DbHandle | null,
  opts: { retentionDays: number; adminEmails?: string[]; intervalMs?: number; initialDelayMs?: number },
): () => void {
  const run = async () => {
    const db = getDb();
    if (!db) return;
    try {
      const r = await purgeExpiredLogs(db, opts);
      console.log(
        `[retention] ${opts.retentionDays}d: ${r.deletedUsageEvents} usage_events, ${r.deletedAnalysisRuns} analysis_runs gelöscht` +
          (r.archivedWeeks.length ? `; Wochen archiviert: ${r.archivedWeeks.join(', ')}` : ''),
      );
    } catch (err) {
      console.error('[retention] Purge fehlgeschlagen:', err);
    }
  };
  const first = setTimeout(() => void run(), opts.initialDelayMs ?? 60_000);
  const timer = setInterval(() => void run(), opts.intervalMs ?? DAY_MS);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}

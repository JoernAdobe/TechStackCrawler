/**
 * Nutzungs-Events für das Management-Dashboard (User, Aktivität, Feature-Nutzung).
 * Datensparsam: anonyme Besucher-ID (Cookie), E-Mail nur bei Okta-Session.
 */
import type { DbHandle } from './types.js';

export interface UsageEvent {
  tsMs: number;
  visitorId: string;
  email?: string | null;
  event: string;
  analysisId?: number | null;
  status: number;
}

export interface UsageEventRow {
  ts_ms: number;
  visitor_id: string;
  email: string | null;
  event: string;
  analysis_id: number | null;
  status: number;
}

export async function initUsageEventsTable(p: DbHandle): Promise<void> {
  const sqlite = p.dialect === 'sqlite';
  await p.execute(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id ${sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'BIGINT AUTO_INCREMENT PRIMARY KEY'},
      ts_ms BIGINT NOT NULL,
      visitor_id VARCHAR(64) NOT NULL,
      email VARCHAR(320),
      event VARCHAR(40) NOT NULL,
      analysis_id ${sqlite ? 'INTEGER' : 'INT'},
      status ${sqlite ? 'INTEGER' : 'INT'} NOT NULL
    )
  `);
  if (sqlite) {
    await p.execute(`CREATE INDEX IF NOT EXISTS idx_usage_events_ts ON usage_events(ts_ms)`);
  } else {
    try {
      await p.execute(`CREATE INDEX idx_usage_events_ts ON usage_events(ts_ms)`);
    } catch {
      // Index existiert bereits
    }
  }
}

/**
 * Anonyme Wochen-Aggregate (nur Zählwerte, keine Besucher-IDs/E-Mails). Werden vom
 * Log-Purge geschrieben, bevor alte usage_events gelöscht werden (RETENTION_LOG_DAYS).
 */
export interface UsageWeeklyRow {
  week: string;
  first_ts_ms: number;
  active_users: number;
  new_users: number;
  returning_users: number;
  visits: number;
  /** Event-Name → Anzahl erfolgreicher Aktionen in der Woche. */
  features: Record<string, number>;
}

export async function initUsageWeeklyTable(p: DbHandle): Promise<void> {
  const int = p.dialect === 'sqlite' ? 'INTEGER' : 'INT';
  await p.execute(`
    CREATE TABLE IF NOT EXISTS usage_weekly (
      week VARCHAR(10) NOT NULL PRIMARY KEY,
      first_ts_ms BIGINT NOT NULL,
      active_users ${int} NOT NULL,
      new_users ${int} NOT NULL,
      returning_users ${int} NOT NULL,
      visits ${int} NOT NULL,
      features_json TEXT NOT NULL,
      archived_ms BIGINT NOT NULL
    )
  `);
}

/** Schreibt eine Woche nur, wenn sie noch nicht archiviert ist (erste Berechnung hat noch alle Events). */
export async function insertUsageWeeklyIfAbsent(db: DbHandle, w: UsageWeeklyRow, archivedMs = Date.now()): Promise<boolean> {
  const verb = db.dialect === 'sqlite' ? 'INSERT OR IGNORE' : 'INSERT IGNORE';
  const { affectedRows } = await db.execute(
    `${verb} INTO usage_weekly (week, first_ts_ms, active_users, new_users, returning_users, visits, features_json, archived_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [w.week, w.first_ts_ms, w.active_users, w.new_users, w.returning_users, w.visits, JSON.stringify(w.features), archivedMs],
  );
  return Number(affectedRows ?? 0) > 0;
}

export async function listUsageWeekly(db: DbHandle): Promise<UsageWeeklyRow[]> {
  const { rows } = await db.execute(
    `SELECT week, first_ts_ms, active_users, new_users, returning_users, visits, features_json FROM usage_weekly ORDER BY week ASC`,
  );
  return (rows as Array<Record<string, unknown>>).map((r) => {
    let features: Record<string, number> = {};
    try {
      features = JSON.parse(String(r.features_json ?? '{}'));
    } catch {
      // defekte Zeile → ohne Feature-Zahlen
    }
    return {
      week: String(r.week),
      first_ts_ms: Number(r.first_ts_ms),
      active_users: Number(r.active_users),
      new_users: Number(r.new_users),
      returning_users: Number(r.returning_users),
      visits: Number(r.visits),
      features,
    };
  });
}

export async function deleteUsageEventsBefore(db: DbHandle, cutoffMs: number): Promise<number> {
  const { affectedRows } = await db.execute(`DELETE FROM usage_events WHERE ts_ms < ?`, [cutoffMs]);
  return Number(affectedRows ?? 0);
}

export async function insertUsageEvent(db: DbHandle, e: UsageEvent): Promise<void> {
  await db.execute(
    `INSERT INTO usage_events (ts_ms, visitor_id, email, event, analysis_id, status) VALUES (?, ?, ?, ?, ?, ?)`,
    [e.tsMs, e.visitorId, e.email ?? null, e.event, e.analysisId ?? null, e.status],
  );
}

export async function listUsageEvents(db: DbHandle, sinceMs: number): Promise<UsageEventRow[]> {
  const { rows } = await db.execute(
    `SELECT ts_ms, visitor_id, email, event, analysis_id, status FROM usage_events WHERE ts_ms >= ? ORDER BY ts_ms ASC`,
    [sinceMs],
  );
  return (rows as UsageEventRow[]).map((r) => ({
    ...r,
    ts_ms: Number(r.ts_ms),
    status: Number(r.status),
    analysis_id: r.analysis_id == null ? null : Number(r.analysis_id),
  }));
}

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

/**
 * Persistenz für Wiederaufnahme nach Verbindungsabbruch/Neustart:
 * - briefing_checkpoints: fertige Briefing-Abschnitte je Job (Resume ohne Neu-Recherche)
 * - auto_jobs: vorgemerkte Hintergrund-Jobs (Auto-GEO, Auto-Use-Cases) je Analyse
 * - analysis_runs: Analyse-Läufe per Request-ID (Client kann nach Abbruch das Ergebnis abholen)
 * Zeitstempel als Epoch-Millisekunden, damit SQLite und MariaDB identisch funktionieren.
 */
import type { DbHandle } from './types.js';
import type { BriefingSection } from '../types/briefing.js';

export async function initResumeTables(p: DbHandle): Promise<void> {
  const sqlite = p.dialect === 'sqlite';
  const longText = sqlite ? 'TEXT' : 'LONGTEXT';
  const int = sqlite ? 'INTEGER' : 'INT';
  await p.execute(`
    CREATE TABLE IF NOT EXISTS briefing_checkpoints (
      job_id ${int} NOT NULL,
      section_id VARCHAR(8) NOT NULL,
      section_json ${longText} NOT NULL,
      updated_ms BIGINT NOT NULL,
      PRIMARY KEY (job_id, section_id)
    )
  `);
  await p.execute(`
    CREATE TABLE IF NOT EXISTS auto_jobs (
      analysis_id ${int} NOT NULL,
      kind VARCHAR(32) NOT NULL,
      payload_json TEXT,
      created_ms BIGINT NOT NULL,
      PRIMARY KEY (analysis_id, kind)
    )
  `);
  await p.execute(`
    CREATE TABLE IF NOT EXISTS analysis_runs (
      request_id VARCHAR(64) NOT NULL PRIMARY KEY,
      url TEXT NOT NULL,
      status VARCHAR(16) NOT NULL,
      analysis_id ${int},
      error_json TEXT,
      created_ms BIGINT NOT NULL,
      updated_ms BIGINT NOT NULL
    )
  `);
}

// ── Briefing-Checkpoints ─────────────────────────────────────────────────────

export async function saveBriefingCheckpoint(db: DbHandle, jobId: number, section: BriefingSection): Promise<void> {
  await db.execute(`DELETE FROM briefing_checkpoints WHERE job_id = ? AND section_id = ?`, [jobId, section.id]);
  await db.execute(
    `INSERT INTO briefing_checkpoints (job_id, section_id, section_json, updated_ms) VALUES (?, ?, ?, ?)`,
    [jobId, section.id, JSON.stringify(section), Date.now()],
  );
}

export async function loadBriefingCheckpoints(db: DbHandle, jobId: number): Promise<BriefingSection[]> {
  const { rows } = await db.execute(`SELECT section_json FROM briefing_checkpoints WHERE job_id = ?`, [jobId]);
  const out: BriefingSection[] = [];
  for (const r of rows as Array<{ section_json: string }>) {
    try {
      out.push(JSON.parse(r.section_json) as BriefingSection);
    } catch {
      // defekter Checkpoint → Abschnitt wird neu erzeugt
    }
  }
  return out;
}

export async function clearBriefingCheckpoints(db: DbHandle, jobId: number): Promise<void> {
  await db.execute(`DELETE FROM briefing_checkpoints WHERE job_id = ?`, [jobId]);
}

// ── Auto-Jobs ────────────────────────────────────────────────────────────────

export interface PendingAutoJob {
  analysisId: number;
  kind: string;
  payload: unknown;
}

export async function markAutoJob(db: DbHandle, analysisId: number, kind: string, payload?: unknown): Promise<void> {
  await db.execute(`DELETE FROM auto_jobs WHERE analysis_id = ? AND kind = ?`, [analysisId, kind]);
  await db.execute(
    `INSERT INTO auto_jobs (analysis_id, kind, payload_json, created_ms) VALUES (?, ?, ?, ?)`,
    [analysisId, kind, payload === undefined ? null : JSON.stringify(payload), Date.now()],
  );
}

export async function clearAutoJob(db: DbHandle, analysisId: number, kind: string): Promise<void> {
  await db.execute(`DELETE FROM auto_jobs WHERE analysis_id = ? AND kind = ?`, [analysisId, kind]);
}

/** Vorgemerkte Jobs einer Art; ältere als maxAgeMs werden verworfen (kein Endlos-Resume). */
export async function listAutoJobs(db: DbHandle, kind: string, maxAgeMs: number): Promise<PendingAutoJob[]> {
  const cutoff = Date.now() - maxAgeMs;
  await db.execute(`DELETE FROM auto_jobs WHERE kind = ? AND created_ms < ?`, [kind, cutoff]);
  const { rows } = await db.execute(`SELECT analysis_id, kind, payload_json FROM auto_jobs WHERE kind = ?`, [kind]);
  return (rows as Array<{ analysis_id: number; kind: string; payload_json: string | null }>).map((r) => {
    let payload: unknown = undefined;
    try {
      payload = r.payload_json ? JSON.parse(r.payload_json) : undefined;
    } catch {
      payload = undefined;
    }
    return { analysisId: Number(r.analysis_id), kind: r.kind, payload };
  });
}

// ── Analyse-Läufe ────────────────────────────────────────────────────────────

export type AnalysisRunStatus = 'running' | 'done' | 'error';

export interface AnalysisRun {
  requestId: string;
  url: string;
  status: AnalysisRunStatus;
  analysisId: number | null;
  error: Record<string, unknown> | null;
  createdMs: number;
}

interface RunRow {
  request_id: string;
  url: string;
  status: string;
  analysis_id: number | null;
  error_json: string | null;
  created_ms: number | string;
}

function mapRun(r: RunRow): AnalysisRun {
  let error: Record<string, unknown> | null = null;
  try {
    error = r.error_json ? (JSON.parse(r.error_json) as Record<string, unknown>) : null;
  } catch {
    error = { error: 'Analysis failed' };
  }
  return {
    requestId: r.request_id,
    url: r.url,
    status: r.status as AnalysisRunStatus,
    analysisId: r.analysis_id == null ? null : Number(r.analysis_id),
    error,
    createdMs: Number(r.created_ms),
  };
}

export async function insertAnalysisRun(db: DbHandle, requestId: string, url: string): Promise<void> {
  const now = Date.now();
  await db.execute(`DELETE FROM analysis_runs WHERE request_id = ?`, [requestId]);
  await db.execute(
    `INSERT INTO analysis_runs (request_id, url, status, analysis_id, error_json, created_ms, updated_ms) VALUES (?, ?, 'running', NULL, NULL, ?, ?)`,
    [requestId, url, now, now],
  );
}

export async function finishAnalysisRun(
  db: DbHandle,
  requestId: string,
  update: { status: 'done'; analysisId: number | null } | { status: 'error'; error: Record<string, unknown> },
): Promise<void> {
  await db.execute(
    `UPDATE analysis_runs SET status = ?, analysis_id = ?, error_json = ?, updated_ms = ? WHERE request_id = ?`,
    [
      update.status,
      update.status === 'done' ? update.analysisId : null,
      update.status === 'error' ? JSON.stringify(update.error) : null,
      Date.now(),
      requestId,
    ],
  );
}

export async function getAnalysisRun(db: DbHandle, requestId: string): Promise<AnalysisRun | null> {
  const { rows } = await db.execute(
    `SELECT request_id, url, status, analysis_id, error_json, created_ms FROM analysis_runs WHERE request_id = ?`,
    [requestId],
  );
  const row = (rows as RunRow[])[0];
  return row ? mapRun(row) : null;
}

/** Beim Start: unterbrochene Läufe (jünger als maxAgeMs) zum Fortsetzen; alte Einträge aufräumen. */
export async function listInterruptedAnalysisRuns(db: DbHandle, maxAgeMs: number): Promise<AnalysisRun[]> {
  const cutoff = Date.now() - maxAgeMs;
  await db.execute(`DELETE FROM analysis_runs WHERE updated_ms < ?`, [Date.now() - 7 * 24 * 3600_000]);
  await db.execute(
    `UPDATE analysis_runs SET status = 'error', error_json = ?, updated_ms = ? WHERE status = 'running' AND created_ms < ?`,
    [JSON.stringify({ error: 'The analysis was interrupted by a server restart.', code: 'interrupted', hint: 'Please start it again.' }), Date.now(), cutoff],
  );
  const { rows } = await db.execute(
    `SELECT request_id, url, status, analysis_id, error_json, created_ms FROM analysis_runs WHERE status = 'running'`,
  );
  return (rows as RunRow[]).map(mapRun);
}

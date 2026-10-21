/**
 * Persistenz der Client-Pre-Briefing-Jobs (Tabelle `briefing_jobs`).
 * Client Pre-Briefing – powered by Chris Whitehead.
 */
import type { DbHandle } from './types.js';
import { toMysqlDatetime } from './analyses.js';
import type {
  BriefingJob,
  BriefingJobStatus,
  BriefingProgress,
  BriefingResult,
  BriefingSectionId,
} from '../types/briefing.js';

export async function initBriefingJobsTable(p: DbHandle): Promise<void> {
  if (p.dialect === 'sqlite') {
    await p.execute(`
      CREATE TABLE IF NOT EXISTS briefing_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        analysis_id INTEGER NOT NULL,
        batch_id INTEGER,
        status TEXT NOT NULL,
        sections_json TEXT NOT NULL,
        progress_json TEXT,
        result_json TEXT,
        html TEXT,
        company_name TEXT,
        error TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT
      )
    `);
    await p.execute(`CREATE INDEX IF NOT EXISTS idx_briefing_jobs_analysis ON briefing_jobs(analysis_id)`);
    await p.execute(`CREATE INDEX IF NOT EXISTS idx_briefing_jobs_status ON briefing_jobs(status)`);
    return;
  }
  await p.execute(`
    CREATE TABLE IF NOT EXISTS briefing_jobs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      analysis_id INT NOT NULL,
      batch_id INT,
      status VARCHAR(16) NOT NULL,
      sections_json TEXT NOT NULL,
      progress_json TEXT,
      result_json LONGTEXT,
      html LONGTEXT,
      company_name VARCHAR(255),
      error TEXT,
      created_by VARCHAR(255),
      created_at DATETIME NOT NULL,
      started_at DATETIME,
      finished_at DATETIME,
      INDEX idx_briefing_jobs_analysis (analysis_id),
      INDEX idx_briefing_jobs_status (status)
    )
  `);
}

interface JobRow {
  id: number;
  analysis_id: number;
  batch_id: number | null;
  status: string;
  sections_json: string;
  progress_json: string | null;
  company_name: string | null;
  error: string | null;
  created_by: string | null;
  created_at: Date | string;
  started_at: Date | string | null;
  finished_at: Date | string | null;
  result_json?: string | null;
}

const JOB_COLUMNS =
  'id, analysis_id, batch_id, status, sections_json, progress_json, company_name, error, created_by, created_at, started_at, finished_at';

function nowFor(db: DbHandle): string {
  const iso = new Date().toISOString();
  return db.dialect === 'mysql' ? toMysqlDatetime(iso) : iso;
}

function toIso(value: Date | string | null | undefined): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (value instanceof Date) return value.toISOString();
  const s = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function parseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function mapJob(r: JobRow): BriefingJob {
  return {
    id: Number(r.id),
    analysisId: Number(r.analysis_id),
    status: r.status as BriefingJobStatus,
    sections: parseJson<BriefingSectionId[]>(r.sections_json, []),
    progress: parseJson<BriefingProgress[]>(r.progress_json, []),
    ...(r.company_name ? { companyName: r.company_name } : {}),
    ...(r.created_by ? { createdBy: r.created_by } : {}),
    ...(r.batch_id !== null && r.batch_id !== undefined ? { batchId: Number(r.batch_id) } : {}),
    ...(r.error ? { error: r.error } : {}),
    createdAt: toIso(r.created_at) ?? '',
    ...(toIso(r.started_at) ? { startedAt: toIso(r.started_at) } : {}),
    ...(toIso(r.finished_at) ? { finishedAt: toIso(r.finished_at) } : {}),
  };
}

export interface InsertBriefingJobInput {
  analysisId: number;
  sections: BriefingSectionId[];
  progress: BriefingProgress[];
  companyName?: string;
  createdBy?: string;
  batchId?: number;
}

export async function insertBriefingJob(db: DbHandle, input: InsertBriefingJobInput): Promise<number> {
  const { insertId } = await db.execute(
    `INSERT INTO briefing_jobs (analysis_id, batch_id, status, sections_json, progress_json, company_name, created_by, created_at)
     VALUES (?, ?, 'queued', ?, ?, ?, ?, ?)`,
    [
      input.analysisId,
      input.batchId ?? null,
      JSON.stringify(input.sections),
      JSON.stringify(input.progress),
      input.companyName?.slice(0, 255) ?? null,
      input.createdBy?.slice(0, 255) ?? null,
      nowFor(db),
    ],
  );
  return Number(insertId ?? 0);
}

export async function getBriefingJob(db: DbHandle, id: number): Promise<BriefingJob | null> {
  const { rows } = await db.execute(`SELECT ${JOB_COLUMNS} FROM briefing_jobs WHERE id = ?`, [id]);
  const row = (rows as JobRow[])[0];
  return row ? mapJob(row) : null;
}

/** Job + Ergebnis-JSON (ohne HTML). */
export async function getBriefingJobWithResult(
  db: DbHandle,
  id: number,
): Promise<{ job: BriefingJob; result: BriefingResult | null } | null> {
  const { rows } = await db.execute(`SELECT ${JOB_COLUMNS}, result_json FROM briefing_jobs WHERE id = ?`, [id]);
  const row = (rows as JobRow[])[0];
  if (!row) return null;
  return { job: mapJob(row), result: parseJson<BriefingResult | null>(row.result_json, null) };
}

/** Ergebnis des neuesten erfolgreich abgeschlossenen Briefings einer Analyse (für Use-Case-Discovery). */
export async function getLatestDoneBriefingResult(db: DbHandle, analysisId: number): Promise<BriefingResult | null> {
  const { rows } = await db.execute(
    `SELECT id FROM briefing_jobs WHERE analysis_id = ? AND status = 'done' ORDER BY id DESC LIMIT 1`,
    [analysisId],
  );
  const row = (rows as Array<{ id: number }>)[0];
  if (!row) return null;
  return (await getBriefingJobWithResult(db, Number(row.id)))?.result ?? null;
}

export async function getLatestBriefingJobId(db: DbHandle, analysisId: number): Promise<number | null> {
  const { rows } = await db.execute(
    `SELECT id FROM briefing_jobs WHERE analysis_id = ? ORDER BY id DESC LIMIT 1`,
    [analysisId],
  );
  const row = (rows as Array<{ id: number }>)[0];
  return row ? Number(row.id) : null;
}

export async function findOpenBriefingJob(db: DbHandle, analysisId: number): Promise<BriefingJob | null> {
  const { rows } = await db.execute(
    `SELECT ${JOB_COLUMNS} FROM briefing_jobs WHERE analysis_id = ? AND status IN ('queued', 'running')
     ORDER BY id DESC LIMIT 1`,
    [analysisId],
  );
  const row = (rows as JobRow[])[0];
  return row ? mapJob(row) : null;
}

/** Ältesten wartenden Job auf 'running' setzen (Single-Process-Worker, wie claimNextItem). */
export async function claimNextBriefingJob(db: DbHandle, excludeIds: number[] = []): Promise<BriefingJob | null> {
  const exclude = excludeIds.length ? ` AND id NOT IN (${excludeIds.map(() => '?').join(', ')})` : '';
  const { rows } = await db.execute(
    `SELECT ${JOB_COLUMNS} FROM briefing_jobs WHERE status = 'queued'${exclude} ORDER BY id ASC LIMIT 1`,
    excludeIds,
  );
  const row = (rows as JobRow[])[0];
  if (!row) return null;
  await db.execute(
    `UPDATE briefing_jobs SET status = 'running', started_at = ?, error = NULL WHERE id = ? AND status = 'queued'`,
    [nowFor(db), row.id],
  );
  const claimed = await getBriefingJob(db, Number(row.id));
  return claimed && claimed.status === 'running' ? claimed : null;
}

export async function updateBriefingProgress(
  db: DbHandle,
  id: number,
  progress: BriefingProgress[],
  companyName?: string,
): Promise<void> {
  await db.execute(
    `UPDATE briefing_jobs SET progress_json = ?, company_name = COALESCE(?, company_name) WHERE id = ?`,
    [JSON.stringify(progress), companyName?.slice(0, 255) ?? null, id],
  );
}

export interface FinishBriefingJobInput {
  status: Extract<BriefingJobStatus, 'done' | 'error' | 'cancelled'>;
  progress?: BriefingProgress[];
  error?: string;
  companyName?: string;
  result?: BriefingResult;
  html?: string;
}

/** Schließt nur Jobs im Status 'running' ab (ein paralleler Cancel gewinnt); true = übernommen. */
export async function finishBriefingJob(db: DbHandle, id: number, input: FinishBriefingJobInput): Promise<boolean> {
  await db.execute(
    `UPDATE briefing_jobs SET status = ?, progress_json = COALESCE(?, progress_json), error = ?,
       company_name = COALESCE(?, company_name), result_json = COALESCE(?, result_json),
       html = COALESCE(?, html), finished_at = ? WHERE id = ? AND status = 'running'`,
    [
      input.status,
      input.progress ? JSON.stringify(input.progress) : null,
      input.error ? input.error.slice(0, 2000) : null,
      input.companyName?.slice(0, 255) ?? null,
      input.result ? JSON.stringify(input.result) : null,
      input.html ?? null,
      nowFor(db),
      id,
    ],
  );
  return (await getBriefingJob(db, id))?.status === input.status;
}

/** Wartenden Job direkt abbrechen; true wenn der Status tatsächlich gewechselt hat. */
export async function cancelQueuedBriefingJob(db: DbHandle, id: number): Promise<boolean> {
  await db.execute(
    `UPDATE briefing_jobs SET status = 'cancelled', finished_at = ? WHERE id = ? AND status = 'queued'`,
    [nowFor(db), id],
  );
  return (await getBriefingJob(db, id))?.status === 'cancelled';
}

export async function markRunningBriefingCancelled(db: DbHandle, id: number): Promise<void> {
  await db.execute(
    `UPDATE briefing_jobs SET status = 'cancelled', finished_at = ? WHERE id = ? AND status = 'running'`,
    [nowFor(db), id],
  );
}

export async function getBriefingJobHtml(db: DbHandle, id: number): Promise<string | null> {
  const { rows } = await db.execute(`SELECT status, html FROM briefing_jobs WHERE id = ?`, [id]);
  const row = (rows as Array<{ status: string; html: string | null }>)[0];
  return row && row.status === 'done' && row.html ? row.html : null;
}

/** Nach Neustart: hängende 'running'-Jobs wieder einreihen. */
export async function requeueRunningBriefingJobs(db: DbHandle): Promise<number> {
  const { rows } = await db.execute(`SELECT id FROM briefing_jobs WHERE status = 'running'`);
  if (rows.length === 0) return 0;
  await db.execute(`UPDATE briefing_jobs SET status = 'queued', started_at = NULL WHERE status = 'running'`);
  return rows.length;
}

export async function countQueuedBriefingJobs(db: DbHandle): Promise<number> {
  const { rows } = await db.execute(`SELECT COUNT(*) AS c FROM briefing_jobs WHERE status = 'queued'`);
  return Number((rows[0] as { c?: number | string } | undefined)?.c ?? 0);
}

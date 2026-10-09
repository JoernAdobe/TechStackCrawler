/**
 * Persistenz für Nutzer-Feedback (EAA: Feedback-Formular → Jira). Tabelle `feedback` aus parityTables.ts.
 */
import type { FeedbackEntry, FeedbackType } from '../types/parity.js';
import type { DbHandle } from './types.js';
import { toMysqlDatetime } from './analyses.js';

export type FeedbackStatus = NonNullable<FeedbackEntry['status']>;
export const FEEDBACK_STATUSES = ['open', 'triaged', 'done'] as const satisfies readonly FeedbackStatus[];

interface FeedbackRow {
  id: number;
  analysis_id: number | null;
  batch_id: number | null;
  type: string;
  rating: number | null;
  title: string | null;
  description: string;
  payload_json: string | null;
  created_by: string | null;
  status: string | null;
  created_at: Date | string;
}

function toIso(v: Date | string): string {
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v.includes('T') ? v : `${v.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

function rowToEntry(r: FeedbackRow): FeedbackEntry {
  let missingSolutions: FeedbackEntry['missingSolutions'];
  if (r.payload_json) {
    try {
      const payload = JSON.parse(r.payload_json) as { missingSolutions?: FeedbackEntry['missingSolutions'] };
      if (Array.isArray(payload.missingSolutions) && payload.missingSolutions.length) missingSolutions = payload.missingSolutions;
    } catch {
      // Defekter Payload: Eintrag trotzdem ausliefern.
    }
  }
  const rating = r.rating === null || r.rating === undefined ? undefined : (Math.sign(Number(r.rating)) as -1 | 0 | 1);
  return {
    id: Number(r.id),
    analysisId: r.analysis_id ?? undefined,
    batchId: r.batch_id ?? undefined,
    type: r.type as FeedbackType,
    rating,
    title: r.title ?? undefined,
    description: r.description,
    missingSolutions,
    createdBy: r.created_by ?? undefined,
    createdAt: toIso(r.created_at),
    status: (FEEDBACK_STATUSES as readonly string[]).includes(r.status ?? '') ? (r.status as FeedbackStatus) : 'open',
  };
}

export async function insertFeedback(db: DbHandle, entry: FeedbackEntry): Promise<number> {
  const now = new Date().toISOString();
  const createdAt = db.dialect === 'mysql' ? toMysqlDatetime(now) : now;
  const payload = entry.missingSolutions?.length ? JSON.stringify({ missingSolutions: entry.missingSolutions }) : null;
  const { insertId } = await db.execute(
    `INSERT INTO feedback (analysis_id, batch_id, type, rating, title, description, payload_json, created_by, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.analysisId ?? null,
      entry.batchId ?? null,
      entry.type,
      entry.rating ?? null,
      entry.title ?? null,
      entry.description,
      payload,
      entry.createdBy ?? null,
      entry.status ?? 'open',
      createdAt,
    ],
  );
  return insertId ?? 0;
}

export async function listFeedback(db: DbHandle, limit = 100, status?: FeedbackStatus): Promise<FeedbackEntry[]> {
  const lim = Math.min(Math.max(1, Math.floor(limit)), 500);
  const where = status ? 'WHERE status = ?' : '';
  const params: unknown[] = status ? [status, lim] : [lim];
  const { rows } = await db.execute(
    `SELECT id, analysis_id, batch_id, type, rating, title, description, payload_json, created_by, status, created_at
     FROM feedback ${where} ORDER BY created_at DESC, id DESC LIMIT ?`,
    params,
  );
  return ((Array.isArray(rows) ? rows : []) as FeedbackRow[]).map(rowToEntry);
}

/** Setzt den Status; liefert false, wenn der Eintrag nicht existiert. */
export async function updateFeedbackStatus(db: DbHandle, id: number, status: FeedbackStatus): Promise<boolean> {
  const { rows } = await db.execute(`SELECT id FROM feedback WHERE id = ?`, [id]);
  if (!Array.isArray(rows) || rows.length === 0) return false;
  await db.execute(`UPDATE feedback SET status = ? WHERE id = ?`, [status, id]);
  return true;
}

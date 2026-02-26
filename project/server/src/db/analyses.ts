import type { DbHandle } from './types.js';
import type { AnalysisResult } from '../types/analysis.js';

export function toMysqlDatetime(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export async function saveAnalysis(
  db: DbHandle,
  result: AnalysisResult,
): Promise<number> {
  const analyzedAt = toMysqlDatetime(result.analyzedAt);
  const { insertId } = await db.execute(
    `INSERT INTO analyses (url, result_json, analyzed_at) VALUES (?, ?, ?)`,
    [result.url, JSON.stringify(result), analyzedAt],
  );
  return insertId ?? 0;
}

export interface AnalysisRow {
  id: number;
  url: string;
  result_json: string;
  analyzed_at: Date | string;
  created_at: Date | string;
}

export async function listAnalyses(
  db: DbHandle,
  limit = 50,
): Promise<AnalysisRow[]> {
  const limitNum = Math.min(Math.max(0, limit), 100);
  try {
    const { rows } = await db.execute(
      `SELECT id, url, result_json, analyzed_at, created_at 
       FROM analyses 
       ORDER BY analyzed_at DESC 
       LIMIT ${limitNum}`,
      [],
    );
    return (Array.isArray(rows) ? rows : []) as AnalysisRow[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('created_at') || msg.includes('Unknown column')) {
      const { rows } = await db.execute(
        `SELECT id, url, result_json, analyzed_at, analyzed_at as created_at 
         FROM analyses 
         ORDER BY analyzed_at DESC 
         LIMIT ${limitNum}`,
        [],
      );
      return (Array.isArray(rows) ? rows : []) as AnalysisRow[];
    }
    throw err;
  }
}

export async function getAnalysisById(
  db: DbHandle,
  id: number,
): Promise<AnalysisResult | null> {
  const { rows } = await db.execute(
    `SELECT id, url, result_json, analyzed_at, created_at 
     FROM analyses WHERE id = ?`,
    [id],
  );
  const row = (Array.isArray(rows) ? rows[0] : null) as AnalysisRow | null;
  if (!row) return null;
  return JSON.parse(row.result_json) as AnalysisResult;
}

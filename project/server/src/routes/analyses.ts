import type { Request, Response } from 'express';
import { getPool } from '../db/index.js';
import { listAnalyses, getAnalysisById } from '../db/analyses.js';

let lastDbWarn = 0;
const DB_WARN_INTERVAL_MS = 60_000;
function warnDbUnavailable(msg: string) {
  const now = Date.now();
  if (now - lastDbWarn > DB_WARN_INTERVAL_MS) {
    lastDbWarn = now;
    console.warn(msg);
  }
}

export async function listAnalysesRoute(_req: Request, res: Response) {
  const pool = getPool();
  if (!pool) {
    res.json([]);
    return;
  }

  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const limit = Math.min(
      parseInt(String(_req.query.limit || 50), 10) || 50,
      100,
    );
    const rows = await listAnalyses(pool, limit);
    res.json(
      rows.map((r) => ({
        id: r.id,
        url: r.url,
        analyzedAt: r.analyzed_at,
        createdAt: r.created_at,
      })),
    );
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { code?: string; errno?: number };
    const isDbUnavailable =
      err.code === 'ECONNREFUSED' ||
      err.code === 'ECONNRESET' ||
      err.code === 'ETIMEDOUT' ||
      (err.message && /ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(err.message));
    if (isDbUnavailable) {
      warnDbUnavailable('List analyses: DB nicht erreichbar, leere Liste (MariaDB mit make docker-up starten)');
      res.json([]);
      return;
    }
    // ER_BAD_FIELD_ERROR = unbekannte Spalte (z.B. created_at fehlt in alter Tabelle)
    if (err.code === 'ER_BAD_FIELD_ERROR' || err.errno === 1054) {
      console.warn('List analyses: DB-Schema veraltet, Migration ausführen');
      res.json([]);
      return;
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error('List analyses error:', error);
    res.status(500).json({
      error: 'Failed to list analyses',
      detail: msg,
    });
  }
}

export async function getAnalysisRoute(req: Request, res: Response) {
  const pool = getPool();
  if (!pool) {
    res.status(503).json({ error: 'Database not available. Set DB_PASSWORD and run MariaDB.' });
    return;
  }

  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(idParam || '', 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid analysis ID' });
    return;
  }

  try {
    const result = await getAnalysisById(pool, id);
    if (!result) {
      res.status(404).json({ error: 'Analysis not found' });
      return;
    }
    res.json(result);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    const isDbUnavailable =
      err.code === 'ECONNREFUSED' ||
      err.code === 'ECONNRESET' ||
      err.code === 'ETIMEDOUT' ||
      (err.message && /ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(err.message));
    if (isDbUnavailable) {
      res.status(503).json({ error: 'Database not available. Set DB_PASSWORD and run MariaDB.' });
      return;
    }
    console.error('Get analysis error:', error);
    res.status(500).json({ error: 'Failed to get analysis' });
  }
}

import type { Request, Response } from 'express';
import { getPool } from '../db/index.js';
import { listAnalyses, getAnalysisById } from '../db/analyses.js';

export async function listAnalysesRoute(_req: Request, res: Response) {
  const pool = getPool();
  if (!pool) {
    res.json([]);
    return;
  }

  try {
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
    console.error('List analyses error:', error);
    res.status(500).json({ error: 'Failed to list analyses' });
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
    console.error('Get analysis error:', error);
    res.status(500).json({ error: 'Failed to get analysis' });
  }
}

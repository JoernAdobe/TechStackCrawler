import type { Request, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../db/index.js';
import { listAnalyses, getAnalysisById } from '../db/analyses.js';
import { isDbUnavailableError, isSchemaOutdatedError } from '../db/errors.js';
import { DbUnavailableError, NotFoundError, parseParams } from '../utils/http.js';

const DB_WARN_INTERVAL_MS = 60_000;
let lastDbWarn = 0;

function warnDbUnavailable(msg: string) {
  const now = Date.now();
  if (now - lastDbWarn > DB_WARN_INTERVAL_MS) {
    lastDbWarn = now;
    console.warn(msg);
  }
}

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Listet die letzten Analysen. Eine fehlende/unerreichbare DB ist hier bewusst
 * kein Fehler, sondern liefert eine leere Liste — die Startseite soll auch ohne
 * laufende MariaDB funktionieren.
 */
export async function listAnalysesRoute(req: Request, res: Response) {
  const pool = getPool();
  if (!pool) {
    res.json([]);
    return;
  }

  const { limit } = parseParams(listQuerySchema, req.query);

  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
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
    if (isDbUnavailableError(error)) {
      warnDbUnavailable('List analyses: DB nicht erreichbar, leere Liste (MariaDB mit make docker-up starten)');
      res.json([]);
      return;
    }
    if (isSchemaOutdatedError(error)) {
      warnDbUnavailable('List analyses: DB-Schema veraltet, Migration ausführen');
      res.json([]);
      return;
    }
    throw error;
  }
}

export async function getAnalysisRoute(req: Request, res: Response) {
  const pool = getPool();
  if (!pool) {
    throw new DbUnavailableError('Database not available. Set DB_PASSWORD and run MariaDB.');
  }

  const { id } = parseParams(idParamSchema, req.params);

  try {
    const result = await getAnalysisById(pool, id);
    if (!result) {
      throw new NotFoundError('Analysis not found');
    }
    res.json(result);
  } catch (error) {
    if (isDbUnavailableError(error)) {
      throw new DbUnavailableError('Database not available. Set DB_PASSWORD and run MariaDB.');
    }
    throw error;
  }
}
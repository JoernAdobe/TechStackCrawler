/**
 * PowerPoint-Download für Einzelanalysen und Batch-/Account-Assessments.
 */
import { Router, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { getPool } from '../db/index.js';
import { getAnalysisById } from '../db/analyses.js';
import { getBatch } from '../db/batches.js';
import { buildAnalysisDeck, buildBatchDeck } from '../services/deck.js';
import { asyncHandler, DbUnavailableError, NotFoundError, parseParams } from '../utils/http.js';

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** Dateiname nur aus [a-z0-9-], damit Header-Injection/Path-Tricks ausgeschlossen sind. */
export function safeDeckFilename(base: string, fallback: string): string {
  const slug = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${slug || fallback}.pptx`;
}

function sendDeck(res: Response, buffer: Buffer, filename: string): void {
  res.setHeader('Content-Type', PPTX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Cache-Control', 'no-store');
  res.end(buffer);
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function createDeckRoutes(opts: { limiter?: RequestHandler } = {}): Router {
  const router = Router();
  const guards: RequestHandler[] = opts.limiter ? [opts.limiter] : [];

  router.get(
    '/api/analyses/:id/deck.pptx',
    ...guards,
    asyncHandler(async (req, res) => {
      const { id } = parseParams(idParamSchema, req.params);
      const db = getPool();
      if (!db) throw new DbUnavailableError();
      const analysis = await getAnalysisById(db, id);
      if (!analysis) throw new NotFoundError('Analysis not found');
      const buffer = await buildAnalysisDeck(analysis);
      sendDeck(res, buffer, safeDeckFilename(`tech-stack-${hostname(analysis.url)}`, `tech-stack-${id}`));
    }),
  );

  router.get(
    '/api/batches/:id/deck.pptx',
    ...guards,
    asyncHandler(async (req, res) => {
      const { id } = parseParams(idParamSchema, req.params);
      const db = getPool();
      if (!db) throw new DbUnavailableError();
      const batch = await getBatch(db, id);
      if (!batch) throw new NotFoundError('Batch not found');
      const buffer = await buildBatchDeck(batch);
      sendDeck(res, buffer, safeDeckFilename(`eaa-${batch.accountName || batch.title}`, `assessment-${id}`));
    }),
  );

  return router;
}

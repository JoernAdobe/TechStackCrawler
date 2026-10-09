import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { getPool } from '../db/index.js';
import { getAnalysisById } from '../db/analyses.js';
import { saveEnrichment } from '../db/enrichments.js';
import { runGeoScore } from '../services/geoScore.js';
import { asyncHandler, DbUnavailableError, NotFoundError, parseBody, parseParams } from '../utils/http.js';

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const geoBodySchema = z
  .object({
    brand: z.string().trim().max(120).optional(),
    competitors: z.array(z.string().trim().min(1).max(120)).max(5).optional(),
    country: z
      .string()
      .trim()
      .regex(/^([A-Za-z]{2}|GLOBAL|global)$/, 'ISO-3166 alpha-2 code or GLOBAL')
      .optional(),
    queryCount: z.number().int().min(8).max(40).optional(),
  })
  .strict();

/** POST /api/analyses/:id/enrich/geo – GEO-Score / AI-Visibility per Claude (dauert ~1–3 min). */
export function createGeoRoutes(opts: { limiter?: RequestHandler } = {}): Router {
  const router = Router();
  const guards: RequestHandler[] = opts.limiter ? [opts.limiter] : [];

  router.post(
    '/api/analyses/:id/enrich/geo',
    ...guards,
    asyncHandler(async (req, res) => {
      const { id } = parseParams(idParamSchema, req.params);
      const body = parseBody(geoBodySchema, req.body);
      const pool = getPool();
      if (!pool) throw new DbUnavailableError();
      const analysis = await getAnalysisById(pool, id);
      if (!analysis) throw new NotFoundError('Analysis not found');

      const result = await runGeoScore(analysis, {
        ...body,
        brand: body.brand || undefined,
        country: body.country?.toUpperCase(),
      });

      await saveEnrichment(pool, id, 'geo', result);
      res.json({ ok: true, result });
    }),
  );

  return router;
}

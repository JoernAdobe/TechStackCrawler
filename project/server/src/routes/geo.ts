import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { getPool } from '../db/index.js';
import { getAnalysisById } from '../db/analyses.js';
import { autoGeoStatus, runTrackedGeo } from '../services/geoAuto.js';
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

  /** GET /api/analyses/:id/enrich/geo/status – Status des automatischen GEO-Laufs (Client pollt). */
  router.get(
    '/api/analyses/:id/enrich/geo/status',
    asyncHandler(async (req, res) => {
      const { id } = parseParams(idParamSchema, req.params);
      const pool = getPool();
      if (!pool) throw new DbUnavailableError();
      const auto = autoGeoStatus(id);
      if (auto.status === 'running') {
        res.json(auto);
        return;
      }
      const analysis = await getAnalysisById(pool, id);
      if (!analysis) throw new NotFoundError('Analysis not found');
      const geo = analysis.enrichments?.geo;
      res.json(geo ? { status: 'done', result: geo } : auto);
    }),
  );

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

      // Läuft serverseitig weiter und speichert sofort – auch wenn der Client die Verbindung verliert.
      const result = await runTrackedGeo(pool, id, {
        ...body,
        brand: body.brand || undefined,
        country: body.country?.toUpperCase(),
      });
      res.json({ ok: true, result });
    }),
  );

  return router;
}

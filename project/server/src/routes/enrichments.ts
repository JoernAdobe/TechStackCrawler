import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { getPool } from '../db/index.js';
import { getAnalysisById } from '../db/analyses.js';
import { saveEnrichment } from '../db/enrichments.js';
import { runLighthouse } from '../services/lighthouse.js';
import { getTraffic } from '../services/traffic.js';
import { findMobileApps } from '../services/mobileApps.js';
import type { AnalysisResult } from '../types/analysis.js';
import type { AnalysisEnrichments } from '../types/parity.js';
import {
  BadRequestError,
  DbUnavailableError,
  NotFoundError,
  asyncHandler,
  parseBody,
  parseParams,
} from '../utils/http.js';
import { sanitizeUrlWithDns } from '../utils/sanitize.js';

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const mobileAppsBodySchema = z
  .object({
    brand: z.string().trim().min(1).max(100).optional(),
    country: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, 'country must be an ISO 3166-1 alpha-2 code')
      .optional(),
  })
  .strict();

async function loadAnalysis(params: unknown) {
  const { id } = parseParams(idParamSchema, params);
  const pool = getPool();
  if (!pool) throw new DbUnavailableError();
  const analysis = await getAnalysisById(pool, id);
  if (!analysis) throw new NotFoundError('Analysis not found');
  return { pool, id, analysis };
}

async function targetUrl(analysis: AnalysisResult): Promise<string> {
  const safe = await sanitizeUrlWithDns(analysis.finalUrl ?? analysis.url);
  if (!safe) throw new BadRequestError('Analysis URL is not a public http(s) URL');
  return safe;
}

/**
 * On-Demand-Enrichments (Lighthouse, Traffic, Mobile Apps) für gespeicherte Analysen.
 * Ergebnis wird in result_json.enrichments.<key> gemerged und zurückgegeben.
 */
export function createEnrichmentRoutes(opts: { limiter?: RequestHandler } = {}): Router {
  const router = Router();
  const guard: RequestHandler[] = opts.limiter ? [opts.limiter] : [];

  const register = <K extends keyof AnalysisEnrichments>(
    path: string,
    key: K,
    run: (analysis: AnalysisResult, url: string, body: unknown) => Promise<NonNullable<AnalysisEnrichments[K]>>,
  ) => {
    router.post(
      `/api/analyses/:id/enrich/${path}`,
      ...guard,
      asyncHandler(async (req, res) => {
        const { pool, id, analysis } = await loadAnalysis(req.params);
        const url = await targetUrl(analysis);
        const result = await run(analysis, url, req.body);
        const saved = await saveEnrichment(pool, id, key, result);
        if (!saved) throw new NotFoundError('Analysis not found');
        res.json(result);
      }),
    );
  };

  register('lighthouse', 'lighthouse', (_a, url) => runLighthouse(url));
  register('traffic', 'traffic', (_a, url) => getTraffic(url));
  register('mobile-apps', 'mobileApps', (_a, url, body) => {
    const { brand, country } = parseBody(mobileAppsBodySchema, body);
    return findMobileApps({ url, brand, country });
  });

  return router;
}

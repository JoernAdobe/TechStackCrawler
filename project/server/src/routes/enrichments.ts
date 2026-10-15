import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { getPool } from '../db/index.js';
import { getAnalysisById } from '../db/analyses.js';
import { saveEnrichment } from '../db/enrichments.js';
import { runLighthouse } from '../services/lighthouse.js';
import { getTraffic } from '../services/traffic.js';
import { findMobileApps } from '../services/mobileApps.js';
import { getObservePoint, isObservePointConfigured, ObservePointError } from '../services/observepoint/index.js';
import { getTagLibrary } from '../services/observepoint/client.js';
import { buildEvidenceMatrix, observePointCoverage } from '../services/evidenceMatrix.js';
import { config } from '../config.js';
import type { AnalysisResult } from '../types/analysis.js';
import type { AnalysisEnrichments } from '../types/parity.js';
import {
  AppError,
  BadRequestError,
  DbUnavailableError,
  ForbiddenError,
  ServiceUnavailableError,
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

const observePointBodySchema = z
  .object({ mode: z.enum(['reuse', 'fresh']).optional() })
  .strict()
  .optional();

/** ObservePoint-Fehler in HTTP-Fehler übersetzen (Meldungen enthalten nie den API-Key). */
function toHttpError(err: unknown): unknown {
  if (!(err instanceof ObservePointError)) return err;
  if (err.local) return err.status === 403 ? new ForbiddenError(err.message) : new BadRequestError(err.message);
  // Upstream-401/403 bewusst NICHT als 401/403 an den Client – sonst hält der Client
  // seine eigene Session für ungültig.
  if (err.status === 401) return new AppError(502, 'observepoint_auth', err.message);
  if (err.status === 403) return new AppError(502, 'observepoint_forbidden', err.message);
  if (err.status === 400) return new BadRequestError(err.message);
  if (err.status === 429) return new AppError(429, 'observepoint_rate_limited', err.message);
  if (err.status === 503 && !isObservePointConfigured()) return new ServiceUnavailableError(err.message);
  if (err.status === 504) return new AppError(504, 'observepoint_timeout', err.message);
  return new AppError(502, 'observepoint_error', err.message);
}

/** Fehler externer Enrichment-Dienste (PSI, Semrush/Tranco, iTunes) → 502/504 mit klarer Meldung statt generischer 500. */
function toEnrichmentError(path: string, err: unknown): unknown {
  if (err instanceof AppError) return err;
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`[enrich/${path}] failed: ${name} ${message.slice(0, 200)}`);
  if (name === 'TimeoutError' || /timeout|timed out/i.test(message)) {
    return new AppError(504, 'enrichment_timeout', `The ${path} service did not respond in time. Please try again.`);
  }
  if (/429|rate limit/i.test(message)) {
    return new AppError(429, 'enrichment_rate_limited', `The ${path} service is rate-limited. Please try again in a minute.`);
  }
  return new AppError(502, 'enrichment_failed', `The ${path} service failed or returned an unexpected response. Please try again later.`);
}

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
        let result: NonNullable<AnalysisEnrichments[K]>;
        try {
          result = await run(analysis, url, req.body);
        } catch (err) {
          throw toEnrichmentError(path, err);
        }
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

  router.get('/api/observepoint/status', (_req, res) => {
    const { allowCreate, scratchAuditId, maxPages, maxRunAgeDays } = config.observepoint;
    res.json({
      configured: isObservePointConfigured(),
      freshScans: isObservePointConfigured() && allowCreate && scratchAuditId > 0,
      maxPages,
      maxRunAgeDays,
    });
  });

  // ObservePoint abrufen (reuse: bestehende Audits, fresh: Scratch-Audit starten) und Evidence Matrix neu bauen.
  router.post(
    '/api/analyses/:id/enrich/observepoint',
    ...guard,
    asyncHandler(async (req, res) => {
      if (!isObservePointConfigured()) throw new ServiceUnavailableError('ObservePoint is not configured (OBSERVEPOINT_API_KEY is not set).');
      const { pool, id, analysis } = await loadAnalysis(req.params);
      const url = await targetUrl(analysis);
      const mode = parseBody(observePointBodySchema, req.body)?.mode ?? 'reuse';
      try {
        const [observepoint, library] = await Promise.all([getObservePoint(url, mode), getTagLibrary()]);
        const evidenceMatrix = buildEvidenceMatrix({
          detections: analysis.rawDetections ?? [],
          observepoint,
          opCoverage: observePointCoverage(library),
        });
        const saved =
          (await saveEnrichment(pool, id, 'observepoint', observepoint)) &&
          (await saveEnrichment(pool, id, 'evidenceMatrix', evidenceMatrix));
        if (!saved) throw new NotFoundError('Analysis not found');
        res.json({ observepoint, evidenceMatrix });
      } catch (err) {
        throw toHttpError(err);
      }
    }),
  );

  return router;
}

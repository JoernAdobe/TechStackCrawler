import type { Request, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../db/index.js';
import { updateAnalysis } from '../db/analyses.js';
import { discoverUseCases } from '../services/useCaseDiscovery.js';
import type { AnalysisResult } from '../types/analysis.js';
import { parseBody } from '../utils/http.js';

/**
 * Minimal-Schema für den eingehenden Analyse-Payload. Bewusst `passthrough`,
 * da der Client das vollständige Analyse-Objekt zurückschickt und hier nur die
 * Felder geprüft werden, die `discoverUseCases` tatsächlich benötigt.
 */
const analysisSchema = z
  .object({
    id: z.number().int().positive().optional(),
    url: z.string().min(1),
    summary: z.string(),
    analyzedAt: z.string(),
    categories: z.array(z.unknown()),
    rawDetections: z.array(z.unknown()),
  })
  .passthrough();

export async function useCaseDiscoveryRoute(req: Request, res: Response) {
  const parsed = parseBody(analysisSchema, req.body);
  const analysis = parsed as unknown as AnalysisResult;

  const { result, sitemapUrls } = await discoverUseCases(analysis);

  const pool = getPool();
  if (pool && analysis.id) {
    try {
      await updateAnalysis(pool, analysis.id, { useCaseDiscovery: result, sitemapUrls });
    } catch (err) {
      // Persistenz ist hier optional — das Ergebnis geht trotzdem an den Client.
      console.error('Failed to save use case discovery to DB:', err);
    }
  }

  res.json({ ok: true, result });
}

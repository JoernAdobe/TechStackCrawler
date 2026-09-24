import type { Request, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../db/index.js';
import { getAnalysisById, updateAnalysis } from '../db/analyses.js';
import { discoverUseCases } from '../services/useCaseDiscovery.js';
import type { AnalysisResult } from '../types/analysis.js';
import { NotFoundError, parseBody } from '../utils/http.js';

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
  const pool = getPool();

  // Gespeicherte Analysen werden serverseitig aus der DB geladen. Der Client-Payload wird
  // dann ignoriert – sonst könnte jeder mit einer beliebigen `id` und manipuliertem
  // `summary` (Prompt-Injection) fremde Datensätze überschreiben.
  let analysis: AnalysisResult;
  let persist = false;
  if (pool && parsed.id) {
    const stored = await getAnalysisById(pool, parsed.id);
    if (!stored) throw new NotFoundError('Analysis not found');
    analysis = stored;
    persist = true;
  } else {
    analysis = { ...(parsed as unknown as AnalysisResult), id: undefined };
  }

  const { result, sitemapUrls } = await discoverUseCases(analysis);

  if (pool && persist && analysis.id) {
    try {
      await updateAnalysis(pool, analysis.id, { useCaseDiscovery: result, sitemapUrls });
    } catch (err) {
      // Persistenz ist hier optional — das Ergebnis geht trotzdem an den Client.
      console.error('Failed to save use case discovery to DB:', err);
    }
  }

  res.json({ ok: true, result });
}

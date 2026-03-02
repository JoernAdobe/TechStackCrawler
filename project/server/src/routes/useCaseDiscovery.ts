import type { Request, Response } from 'express';
import { getPool } from '../db/index.js';
import { updateAnalysis } from '../db/analyses.js';
import { discoverUseCases } from '../services/useCaseDiscovery.js';
import type { AnalysisResult } from '../types/analysis.js';

function isValidAnalysis(body: unknown): body is AnalysisResult {
  if (!body || typeof body !== 'object') return false;
  const obj = body as Record<string, unknown>;
  return (
    typeof obj.url === 'string' &&
    obj.url.length > 0 &&
    typeof obj.summary === 'string' &&
    typeof obj.analyzedAt === 'string' &&
    Array.isArray(obj.categories) &&
    Array.isArray(obj.rawDetections)
  );
}

export async function useCaseDiscoveryRoute(req: Request, res: Response) {
  if (!isValidAnalysis(req.body)) {
    res.status(400).json({
      error: 'Invalid request: analysis result with url, summary, analyzedAt, categories and rawDetections required',
    });
    return;
  }

  const analysis = req.body;

  try {
    const { result, sitemapUrls } = await discoverUseCases(analysis);

    const pool = getPool();
    if (pool && analysis.id) {
      try {
        await updateAnalysis(pool, analysis.id, {
          useCaseDiscovery: result,
          sitemapUrls,
        });
      } catch (err) {
        console.error('Failed to save use case discovery to DB:', err);
      }
    }

    res.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Use case discovery error:', message);
    res.status(500).json({ error: message });
  }
}

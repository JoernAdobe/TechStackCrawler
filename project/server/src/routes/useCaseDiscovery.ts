import type { Request, Response } from 'express';
import { getPool } from '../db/index.js';
import { updateAnalysis } from '../db/analyses.js';
import { discoverUseCases } from '../services/useCaseDiscovery.js';
import type { AnalysisResult } from '../types/analysis.js';

export async function useCaseDiscoveryRoute(req: Request, res: Response) {
  const analysis = req.body as AnalysisResult;

  if (!analysis || !analysis.url || !Array.isArray(analysis.categories)) {
    res.status(400).json({
      error: 'Invalid request: analysis result with url and categories required',
    });
    return;
  }

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

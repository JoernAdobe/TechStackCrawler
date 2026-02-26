/**
 * Synchroner Analyse-Endpoint – wartet auf das vollständige Ergebnis als JSON.
 * Kein SSE, keine Streaming-Probleme mit Proxies.
 */
import type { Request, Response } from 'express';
import { analyzeUrl } from '../services/analyzer.js';
import { sanitizeUrl } from '../utils/sanitize.js';
import type { SSEWriter } from '../utils/sse.js';

/** Minimaler SSEWriter-Ersatz – sammelt nur das Ergebnis */
function createSyncCollector(): SSEWriter {
  const progress: string[] = [];
  let result: unknown = null;
  return {
    sendProgress(_phase: string, message: string) {
      progress.push(message);
    },
    sendResult(r: unknown) {
      result = r;
    },
    sendError() {},
    close() {},
    getResult: () => result,
    getProgress: () => progress,
  } as unknown as SSEWriter;
}

export async function analyzeSyncRoute(req: Request, res: Response) {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  const sanitizedUrl = sanitizeUrl(url);
  if (!sanitizedUrl) {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  const collector = createSyncCollector() as SSEWriter & {
    getResult(): unknown;
    getProgress(): string[];
  };

  try {
    await analyzeUrl(sanitizedUrl, collector);
    const result = collector.getResult();
    if (result) {
      res.json({ ok: true, result, progress: collector.getProgress() });
    } else {
      res.status(500).json({ error: 'No result', progress: collector.getProgress() });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Analysis error:', message);
    res.status(500).json({ error: message, progress: collector.getProgress() });
  }
}

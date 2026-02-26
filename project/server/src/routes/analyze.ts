import type { Request, Response } from 'express';
import { SSEWriter } from '../utils/sse.js';
import { analyzeUrl } from '../services/analyzer.js';
import { sanitizeUrl } from '../utils/sanitize.js';

export async function analyzeRoute(req: Request, res: Response) {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  const sanitizedUrl = sanitizeUrl(url);
  if (!sanitizedUrl) {
    res.status(400).json({ error: 'Invalid URL. Please provide a valid public URL.' });
    return;
  }

  const sse = new SSEWriter(res);

  // Handle client disconnect
  req.on('close', () => sse.close());

  try {
    await analyzeUrl(sanitizedUrl, sse);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('Analysis error:', message);
    sse.sendError(message);
  } finally {
    sse.close();
  }
}

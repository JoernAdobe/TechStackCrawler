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
    const raw = error instanceof Error ? error.message : 'Unknown error';
    const message = toUserFriendlyError(raw);
    console.error('Analysis error:', raw);
    res.status(500).json({ error: message, progress: collector.getProgress() });
  }
}

function toUserFriendlyError(raw: string): string {
  if (raw.includes('ERR_NAME_NOT_RESOLVED')) {
    return 'Domain konnte nicht aufgelöst werden. Prüfe die URL oder ob die Seite erreichbar ist.';
  }
  if (raw.includes('ERR_CONNECTION_REFUSED') || raw.includes('ECONNREFUSED')) {
    return 'Verbindung abgelehnt – die Website ist möglicherweise nicht erreichbar.';
  }
  if (
    raw.includes('ERR_CONNECTION_TIMED_OUT') ||
    raw.includes('ETIMEDOUT') ||
    raw.includes('Navigation timeout') ||
    raw.includes('timeout') && raw.includes('exceeded')
  ) {
    return 'Zeitüberschreitung – die Website antwortet nicht oder lädt zu langsam.';
  }
  if (raw.includes('ERR_SSL') || raw.includes('CERT')) {
    return 'SSL-/Zertifikatsfehler – die Website hat ein ungültiges Zertifikat.';
  }
  if (raw.includes('net::')) {
    return 'Netzwerkfehler beim Laden der Website. Bitte URL prüfen und erneut versuchen.';
  }
  return raw.length > 120 ? raw.substring(0, 120) + '…' : raw;
}

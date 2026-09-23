/**
 * Synchroner Analyse-Endpoint – wartet auf das vollständige Ergebnis als JSON.
 * Kein SSE, keine Streaming-Probleme mit Proxies.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { analyzeUrl, type AnalysisWriter } from '../services/analyzer.js';
import { sanitizeUrlWithDns } from '../utils/sanitize.js';
import { BadRequestError, parseBody } from '../utils/http.js';

const analyzeSchema = z.object({
  url: z.string().min(1).max(2048),
});

interface SyncCollector extends AnalysisWriter {
  getResult(): unknown;
  getProgress(): string[];
}

function createSyncCollector(): SyncCollector {
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
  };
}

export async function analyzeSyncRoute(req: Request, res: Response) {
  const { url } = parseBody(analyzeSchema, req.body);

  const sanitizedUrl = await sanitizeUrlWithDns(url);
  if (!sanitizedUrl) {
    throw new BadRequestError('Invalid or disallowed URL');
  }

  const collector = createSyncCollector();

  try {
    await analyzeUrl(sanitizedUrl, collector);
    const result = collector.getResult();
    if (result) {
      res.json({ ok: true, result, progress: collector.getProgress() });
    } else {
      res.status(500).json({ error: 'No result', code: 'no_result', progress: collector.getProgress() });
    }
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'Unknown error';
    console.error('Analysis error:', raw);
    res.status(500).json({
      error: toUserFriendlyError(raw),
      code: 'analysis_failed',
      progress: collector.getProgress(),
    });
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
    (raw.includes('timeout') && raw.includes('exceeded'))
  ) {
    return 'Zeitüberschreitung – die Website antwortet nicht oder lädt zu langsam.';
  }
  if (raw.includes('ERR_SSL') || raw.includes('CERT')) {
    return 'SSL-/Zertifikatsfehler – die Website hat ein ungültiges Zertifikat.';
  }
  if (raw.includes('net::')) {
    return 'Netzwerkfehler beim Laden der Website. Bitte URL prüfen und erneut versuchen.';
  }
  if (
    raw.includes('JSON') ||
    raw.includes('Unterminated') ||
    raw.includes('Unexpected token')
  ) {
    return 'Die Analyse konnte nicht vollständig verarbeitet werden. Bitte erneut versuchen.';
  }
  if (raw.includes('Blocked unsafe')) {
    return 'Die Seite leitet auf eine nicht erlaubte Adresse weiter und wurde blockiert.';
  }
  // Kein Durchreichen der Rohmeldung: sie kann Dateipfade, Library-Interna oder
  // Infrastrukturdetails enthalten. Die Originalmeldung steht im Server-Log.
  return 'Die Analyse ist fehlgeschlagen. Bitte später erneut versuchen.';
}

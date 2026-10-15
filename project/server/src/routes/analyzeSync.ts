/**
 * Synchroner Analyse-Endpoint – wartet auf das vollständige Ergebnis als JSON.
 * Kein SSE, keine Streaming-Probleme mit Proxies.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { analyzeUrl, type AnalysisWriter } from '../services/analyzer.js';
import { sanitizeUrlWithDns } from '../utils/sanitize.js';
import { validateUrlInput } from '../utils/urlInput.js';
import { preflightUrl } from '../services/urlPreflight.js';
import { findDomainSuggestion } from '../services/domainSuggest.js';
import { BadRequestError, parseBody } from '../utils/http.js';

const analyzeSchema = z.object({
  // Inhaltliche Prüfung (leer, mehrere URLs, TLD …) macht validateUrlInput mit konkreter Meldung.
  url: z.string().max(4096),
});

interface UserFacingError {
  error: string;
  code: string;
  hint?: string;
  suggestion?: string;
}

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

  const input = validateUrlInput(url);
  if (!input.ok) {
    const body: UserFacingError = { error: input.message, code: input.code, hint: input.hint, suggestion: input.suggestion };
    res.status(400).json(body);
    return;
  }

  const preflight = await preflightUrl(input.url);
  if (!preflight.ok) {
    const body: UserFacingError = {
      error: preflight.message,
      code: preflight.code,
      hint: preflight.hint,
      suggestion: preflight.suggestion,
    };
    res.status(422).json(body);
    return;
  }

  // SSRF-Schutz bleibt unverändert die letzte Instanz vor dem Scrape.
  const sanitizedUrl = await sanitizeUrlWithDns(input.url);
  if (!sanitizedUrl) {
    throw new BadRequestError('This URL cannot be analyzed (private, internal or unresolvable address).');
  }

  const collector = createSyncCollector();

  try {
    await analyzeUrl(sanitizedUrl, collector);
    const result = collector.getResult();
    if (result) {
      res.json({ ok: true, result, progress: collector.getProgress() });
    } else {
      res.status(500).json({
        error: 'The analysis finished without a result.',
        code: 'no_result',
        hint: 'Please try again.',
        progress: collector.getProgress(),
      });
    }
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'Unknown error';
    console.error('Analysis error:', raw);
    const friendly = toUserFriendlyError(raw);
    const suggestion = friendly.suggestTypo
      ? await findDomainSuggestion(input.hostname).catch(() => null)
      : null;
    res.status(500).json({
      error: friendly.message,
      code: friendly.code,
      hint: suggestion ? `Did you mean ${suggestion}?` : friendly.hint,
      ...(suggestion ? { suggestion } : {}),
      progress: collector.getProgress(),
    });
  }
}

interface FriendlyError {
  message: string;
  code: string;
  hint?: string;
  /** Bei Netzwerk-/Timeout-Fehlern lohnt sich ein "Did you mean …?"-Vorschlag. */
  suggestTypo?: boolean;
}

export function toUserFriendlyError(raw: string): FriendlyError {
  if (raw.includes('ERR_NAME_NOT_RESOLVED')) {
    return {
      message: 'The domain could not be resolved.',
      code: 'domain_not_found',
      hint: 'Please check the URL for typos.',
      suggestTypo: true,
    };
  }
  if (raw.includes('ERR_CONNECTION_REFUSED') || raw.includes('ECONNREFUSED')) {
    return {
      message: 'The website refused the connection.',
      code: 'site_unreachable',
      hint: 'The site may be down. Please check the URL or try again later.',
      suggestTypo: true,
    };
  }
  if (
    raw.includes('ERR_CONNECTION_TIMED_OUT') ||
    raw.includes('ETIMEDOUT') ||
    raw.includes('Navigation timeout') ||
    /timed? ?out/i.test(raw) ||
    (raw.includes('timeout') && raw.includes('exceeded'))
  ) {
    return {
      message: 'The website did not respond in time or loads too slowly.',
      code: 'site_timeout',
      hint: 'Please check the URL for typos or try again later.',
      suggestTypo: true,
    };
  }
  if (raw === 'terminated' || raw.includes('ECONNRESET')) {
    return {
      message: 'The connection to the AI model was interrupted.',
      code: 'ai_interrupted',
      hint: 'Please try again.',
    };
  }
  if (raw.includes('ERR_SSL') || raw.includes('CERT')) {
    return {
      message: 'The website has an invalid SSL certificate.',
      code: 'ssl_error',
      hint: 'Try the http:// version of the URL or check the address.',
    };
  }
  if (raw.includes('net::')) {
    return {
      message: 'A network error occurred while loading the website.',
      code: 'network_error',
      hint: 'Please check the URL and try again.',
      suggestTypo: true,
    };
  }
  if (raw.includes('JSON') || raw.includes('Unterminated') || raw.includes('Unexpected token')) {
    return {
      message: 'The analysis result could not be processed completely.',
      code: 'analysis_failed',
      hint: 'Please try again.',
    };
  }
  if (raw.includes('Blocked unsafe') || raw.includes('Blocked URL')) {
    return {
      message: 'The website redirects to a disallowed address and was blocked.',
      code: 'url_disallowed',
      hint: 'Only public websites can be analyzed.',
    };
  }
  // Kein Durchreichen der Rohmeldung: sie kann Dateipfade, Library-Interna oder
  // Infrastrukturdetails enthalten. Die Originalmeldung steht im Server-Log.
  return { message: 'The analysis failed.', code: 'analysis_failed', hint: 'Please try again later.' };
}

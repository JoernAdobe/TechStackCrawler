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
import { BadRequestError, DbUnavailableError, NotFoundError, parseBody, parseParams } from '../utils/http.js';
import { getPool } from '../db/index.js';
import { getAnalysisById } from '../db/analyses.js';
import { finishAnalysisRun, getAnalysisRun, insertAnalysisRun, listInterruptedAnalysisRuns } from '../db/resumeStore.js';
import type { AnalysisResult } from '../types/analysis.js';

const analyzeSchema = z.object({
  // Inhaltliche Prüfung (leer, mehrere URLs, TLD …) macht validateUrlInput mit konkreter Meldung.
  url: z.string().max(4096),
  /** Vom Client erzeugte ID, um das Ergebnis nach einem Verbindungsabbruch abzuholen. */
  requestId: z.string().max(64).optional(),
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

  const requestId = parsedRequestId(req.body);
  const pool = getPool();
  if (pool && requestId) await insertAnalysisRun(pool, requestId, sanitizedUrl).catch(() => undefined);

  // Läuft bis zum Ende weiter und speichert, auch wenn der Client die Verbindung verliert;
  // der Client holt das Ergebnis dann über GET /api/analysis-runs/:requestId ab.
  const outcome = await executeAnalysis(sanitizedUrl, input.hostname, requestId);
  res.status(outcome.status).json(outcome.body);
}

const requestIdSchema = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);

function parsedRequestId(body: unknown): string | null {
  const raw = (body as { requestId?: unknown } | null)?.requestId;
  const r = requestIdSchema.safeParse(raw);
  return r.success ? r.data : null;
}

interface AnalysisOutcome {
  status: number;
  body: Record<string, unknown>;
}

/** Führt die Analyse aus und schreibt das Ergebnis (bzw. den Fehler) in analysis_runs. */
async function executeAnalysis(url: string, hostname: string, requestId: string | null): Promise<AnalysisOutcome> {
  const collector = createSyncCollector();
  const pool = getPool();
  let outcome: AnalysisOutcome;
  try {
    await analyzeUrl(url, collector);
    const result = collector.getResult() as AnalysisResult | null;
    outcome = result
      ? { status: 200, body: { ok: true, result, progress: collector.getProgress() } }
      : {
        status: 500,
        body: { error: 'The analysis finished without a result.', code: 'no_result', hint: 'Please try again.', progress: collector.getProgress() },
      };
    if (pool && requestId) {
      await finishAnalysisRun(pool, requestId, result?.id
        ? { status: 'done', analysisId: result.id }
        : { status: 'error', error: outcome.body }).catch(() => undefined);
    }
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'Unknown error';
    console.error('Analysis error:', raw);
    const friendly = toUserFriendlyError(raw);
    const suggestion = friendly.suggestTypo
      ? await findDomainSuggestion(hostname).catch(() => null)
      : null;
    const body = {
      error: friendly.message,
      code: friendly.code,
      hint: suggestion ? `Did you mean ${suggestion}?` : friendly.hint,
      ...(suggestion ? { suggestion } : {}),
    };
    if (pool && requestId) await finishAnalysisRun(pool, requestId, { status: 'error', error: body }).catch(() => undefined);
    outcome = { status: 500, body: { ...body, progress: collector.getProgress() } };
  }
  return outcome;
}

const runParamSchema = z.object({ requestId: requestIdSchema });

/** GET /api/analysis-runs/:requestId – Status/Ergebnis eines Analyse-Laufs (Wiederaufnahme nach Verbindungsabbruch). */
export async function analysisRunRoute(req: Request, res: Response) {
  const { requestId } = parseParams(runParamSchema, req.params);
  const pool = getPool();
  if (!pool) throw new DbUnavailableError();
  const run = await getAnalysisRun(pool, requestId);
  if (!run) throw new NotFoundError('Analysis run not found');
  if (run.status === 'done' && run.analysisId) {
    const result = await getAnalysisById(pool, run.analysisId);
    if (result) {
      res.json({ status: 'done', result });
      return;
    }
  }
  if (run.status === 'running') {
    res.json({ status: 'running', url: run.url });
    return;
  }
  res.json({ status: 'error', error: run.error ?? { error: 'Analysis failed', code: 'unknown' } });
}

/** Nach einem Neustart: unterbrochene Analyse-Läufe (≤ 30 min alt) neu starten. */
export async function resumeAnalysisRuns(): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;
  const runs = await listInterruptedAnalysisRuns(pool, 30 * 60_000);
  for (const run of runs) {
    void (async () => {
      const safe = await sanitizeUrlWithDns(run.url).catch(() => null);
      if (!safe) {
        await finishAnalysisRun(pool, run.requestId, { status: 'error', error: { error: 'This URL cannot be analyzed.', code: 'bad_request' } }).catch(() => undefined);
        return;
      }
      let host = '';
      try {
        host = new URL(safe).hostname;
      } catch {
        host = '';
      }
      console.log(`Resuming interrupted analysis ${run.requestId} (${safe})`);
      await executeAnalysis(safe, host, run.requestId);
    })();
  }
  return runs.length;
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

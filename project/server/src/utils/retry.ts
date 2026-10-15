/**
 * Generisches Retry mit Exponential Backoff + Full Jitter sowie eine Fehlerklassifizierung
 * für externe Aufrufe (Bedrock/LLM, HTTP-APIs). Keine Abhängigkeiten, gut testbar
 * (sleep und random sind injizierbar).
 */

export type ErrorKind =
  /** Netzwerkabbruch, Timeout, 5xx – erneuter Versuch sinnvoll. */
  | 'transient'
  /** 429 / Throttling – erneuter Versuch mit längerem Backoff sinnvoll. */
  | 'throttled'
  /** 401/403, abgelaufene Credentials – Retry zwecklos. */
  | 'auth'
  /** Antwort kam an, war aber unbrauchbar (kaputtes JSON, falsche Struktur). */
  | 'invalid_response'
  /** Alles andere (400, Validierung, Programmierfehler). */
  | 'fatal';

const TRANSIENT_MESSAGE =
  /terminated|ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|other side closed|UND_ERR|fetch failed|network|connection error|timed? ?out|premature close|stream (?:ended|closed)|overloaded|service unavailable|internal server error|bad gateway/i;
const THROTTLE_MESSAGE = /throttl|too many requests|rate.?limit|slow down/i;
const AUTH_MESSAGE = /expired|unauthori[sz]ed|invalid.*(?:credentials|api.?key|token)|security token|access denied|forbidden/i;

function statusOf(err: unknown): number | undefined {
  const s = (err as { status?: unknown; statusCode?: unknown } | null | undefined);
  const value = s?.status ?? s?.statusCode;
  return typeof value === 'number' ? value : undefined;
}

/** Ordnet einen beliebigen Fehler einer Fehlerklasse zu. */
export function classifyError(err: unknown): ErrorKind {
  if (err instanceof RetryableResponseError) return 'invalid_response';
  if (err instanceof SyntaxError) return 'invalid_response';
  const status = statusOf(err);
  if (status === 429) return 'throttled';
  if (status === 401 || status === 403) return 'auth';
  if (status !== undefined && (status === 408 || status === 409 || status >= 500)) return 'transient';

  const name = err instanceof Error ? err.name : '';
  const code = (err as NodeJS.ErrnoException | null)?.code ?? '';
  const message = `${name} ${code} ${err instanceof Error ? err.message : String(err ?? '')}`;
  const cause = err instanceof Error && err.cause instanceof Error ? ` ${err.cause.message}` : '';
  const text = message + cause;

  if (/APIConnection(?:Timeout)?Error|TimeoutError|AbortError/.test(name)) return 'transient';
  if (THROTTLE_MESSAGE.test(text)) return 'throttled';
  if (AUTH_MESSAGE.test(text)) return 'auth';
  if (TRANSIENT_MESSAGE.test(text)) return 'transient';
  if (status !== undefined && status >= 400) return 'fatal';
  return 'fatal';
}

export function isRetryableKind(kind: ErrorKind): boolean {
  return kind === 'transient' || kind === 'throttled' || kind === 'invalid_response';
}

/** Markiert eine angekommene, aber unbrauchbare Antwort (z. B. kaputtes LLM-JSON) als wiederholbar. */
export class RetryableResponseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RetryableResponseError';
  }
}

/** Full-Jitter-Backoff: zufällig in [0, min(max, base·2^attempt)]; mindestens 10 % der Spanne. */
export function backoffDelay(attempt: number, baseMs: number, maxMs: number, random: () => number = Math.random): number {
  const cap = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(cap * (0.1 + 0.9 * random()));
}

export interface RetryOptions {
  /** Gesamtzahl der Versuche inkl. des ersten (>= 1). */
  attempts: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Entscheidet, ob nach diesem Fehler erneut versucht wird. Default: transient/throttled/invalid_response. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  onRetry?: (info: { err: unknown; attempt: number; delayMs: number; kind: ErrorKind }) => void;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Führt `fn` aus und wiederholt bei wiederholbaren Fehlern mit Backoff. Wirft den letzten Fehler. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  const attempts = Math.max(1, Math.floor(opts.attempts));
  const base = opts.baseDelayMs ?? 1_000;
  const max = opts.maxDelayMs ?? 15_000;
  const sleep = opts.sleep ?? defaultSleep;
  const shouldRetry = opts.shouldRetry ?? ((err: unknown) => isRetryableKind(classifyError(err)));

  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === attempts - 1 || !shouldRetry(err, attempt)) throw err;
      const kind = classifyError(err);
      // Throttling bekommt einen größeren Grund-Backoff.
      const delayMs = backoffDelay(attempt, kind === 'throttled' ? base * 3 : base, max, opts.random);
      opts.onRetry?.({ err, attempt, delayMs, kind });
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

/** Kurze, geheimnisfreie Beschreibung eines Fehlers fürs Log (keine Header/Bodies). */
export function describeError(err: unknown): string {
  const status = statusOf(err);
  const name = err instanceof Error ? err.name : typeof err;
  const message = err instanceof Error ? err.message : String(err);
  return `${name}${status ? ` (HTTP ${status})` : ''}: ${message.slice(0, 300)}`;
}

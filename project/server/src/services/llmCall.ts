import { classifyError, describeError, withRetry, type ErrorKind } from '../utils/retry.js';

/**
 * Gemeinsamer Wrapper für alle Bedrock/LLM-Aufrufe: Gesamt-Timeout pro Versuch,
 * Retry mit Exponential Backoff + Jitter bei transienten Fehlern ("terminated",
 * ECONNRESET, 429/Throttling, 5xx, kaputtes JSON) und klare Fehlerklassen.
 *
 * Tuning per Env: BEDROCK_MAX_ATTEMPTS (Default 3), BEDROCK_TIMEOUT_MS (Default 180000),
 * BEDROCK_RETRY_BASE_MS (Default 1500).
 */

/** Endgültiger LLM-Fehler mit Klassifizierung; die Meldung enthält nie Credentials. */
export class LlmError extends Error {
  constructor(
    readonly kind: ErrorKind | 'timeout',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'LlmError';
  }
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export interface LlmCallOptions {
  attempts?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  /** Für Tests: Backoff ohne echtes Warten. */
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, kind: ErrorKind) => void;
}

const USER_MESSAGES: Record<LlmError['kind'], string> = {
  auth: 'AI service authentication failed – the Bedrock API key or IAM credentials are missing or expired.',
  throttled: 'AI service is currently rate-limited. Please try again in a minute.',
  transient: 'The connection to the AI service was interrupted.',
  timeout: 'The AI service did not respond in time.',
  invalid_response: 'The AI service returned an unreadable response.',
  fatal: 'The AI request failed.',
};

/**
 * Führt `run(signal)` mit Timeout + Retry aus. `run` muss das Signal an den SDK-Aufruf
 * weiterreichen, damit hängende Streams wirklich abgebrochen werden.
 */
export async function callLlm<T>(
  label: string,
  run: (signal: AbortSignal, attempt: number) => Promise<T>,
  opts: LlmCallOptions = {},
): Promise<T> {
  const attempts = opts.attempts ?? envInt('BEDROCK_MAX_ATTEMPTS', 3, 1, 6);
  const timeoutMs = opts.timeoutMs ?? envInt('BEDROCK_TIMEOUT_MS', 180_000, 5_000, 900_000);
  const baseDelayMs = opts.baseDelayMs ?? envInt('BEDROCK_RETRY_BASE_MS', 1_500, 0, 30_000);

  try {
    return await withRetry(
      async (attempt) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          return await run(controller.signal, attempt);
        } catch (err) {
          if (controller.signal.aborted) {
            throw new LlmError('timeout', `${label}: no response within ${timeoutMs} ms`, { cause: err });
          }
          throw err;
        } finally {
          clearTimeout(timer);
        }
      },
      {
        attempts,
        baseDelayMs,
        maxDelayMs: 20_000,
        sleep: opts.sleep,
        shouldRetry: (err) => {
          const kind = err instanceof LlmError ? err.kind : classifyError(err);
          return kind === 'timeout' || kind === 'transient' || kind === 'throttled' || kind === 'invalid_response';
        },
        onRetry: ({ err, attempt, delayMs, kind }) => {
          console.warn(`[llm] ${label}: attempt ${attempt + 1}/${attempts} failed (${err instanceof LlmError ? err.kind : kind}) – retrying in ${delayMs} ms. ${describeError(err)}`);
          opts.onRetry?.(attempt + 1, kind);
        },
      },
    );
  } catch (err) {
    const kind: LlmError['kind'] = err instanceof LlmError ? err.kind : classifyError(err);
    console.error(`[llm] ${label}: giving up (${kind}). ${describeError(err)}`);
    throw new LlmError(kind, USER_MESSAGES[kind], { cause: err });
  }
}

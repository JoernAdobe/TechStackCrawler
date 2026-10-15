/**
 * Zentraler API-Client.
 *
 * Vorher war die fetch-Logik über mehrere Hooks und Komponenten verteilt, jeweils
 * mit eigenem Fehler-Parsing, eigenem Auth-Header und ohne Abbruch bei Unmount.
 * Hier ist all das an einer Stelle gebündelt.
 */

/** Fehler einer API-Antwort inkl. HTTP-Status und Server-Fehlercode. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  /** Handlungsempfehlung des Servers (z. B. "Did you mean bmw.com?"). */
  readonly hint?: string;
  /** Korrigierte Eingabe, die die UI als Ein-Klick-Vorschlag anbieten kann. */
  readonly suggestion?: string;

  constructor(
    status: number,
    message: string,
    code?: string,
    details?: unknown,
    extra?: { hint?: string; suggestion?: string },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.hint = extra?.hint;
    this.suggestion = extra?.suggestion;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Bearer-Token für geschützte Endpunkte (Break-Glass-Login). */
  token?: string | null;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/** True, wenn der Fehler vom Abbruch eines Requests stammt (kein echter Fehler). */
export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException || error instanceof Error) && error.name === 'AbortError'
  );
}

/** Meldung, wenn der Server (bzw. der Dev-Proxy dahinter) nicht sinnvoll geantwortet hat. */
export const SERVER_UNREACHABLE_MESSAGE = 'Server was restarted or is unreachable – please try again.';
export const OFFLINE_MESSAGE = 'You appear to be offline – check your network connection and try again.';

/** Antwort-Body lesen; `json` ist null, wenn der Body kein (gültiges) JSON war. */
async function parseResponseBody(res: Response): Promise<{ json: unknown; text: string }> {
  let text = '';
  try {
    text = await res.text();
  } catch {
    return { json: null, text: '' };
  }
  if (!text) return { json: null, text };
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json') || /^\s*[{[]/.test(text)) {
    try {
      return { json: JSON.parse(text), text };
    } catch {
      return { json: null, text };
    }
  }
  return { json: null, text };
}

/** Fehlertext aus einer Nicht-JSON-Antwort: Gateway-/Proxy-Fehler → Neustart-Hinweis, sonst kurzer Klartext. */
function nonJsonErrorMessage(status: number, text: string): string {
  // 5xx ohne JSON stammt nicht aus unserem errorHandler (der antwortet immer mit JSON),
  // sondern vom Vite-Proxy/Reverse-Proxy, z. B. weil der Server gerade neu startet.
  if (status >= 500 || status === 0) return SERVER_UNREACHABLE_MESSAGE;
  const plain = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (plain && plain.length <= 200) return plain;
  return `Request failed (HTTP ${status})`;
}

/**
 * Führt einen API-Request aus und wirft bei Fehlern einen `ApiError`.
 * Das Backend antwortet einheitlich mit `{ error, code, details? }`.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, signal, headers = {} } = options;

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      signal,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    // fetch wirft nur bei Netzwerkfehlern (offline, Verbindung abgebrochen, Server weg).
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw new ApiError(0, offline ? OFFLINE_MESSAGE : SERVER_UNREACHABLE_MESSAGE, offline ? 'offline' : 'network_error');
  }

  const { json, text } = await parseResponseBody(res);

  if (!res.ok) {
    if (json && typeof json === 'object') {
      const payload = json as { error?: unknown; code?: string; details?: unknown; hint?: unknown; suggestion?: unknown };
      const message = typeof payload.error === 'string' && payload.error ? payload.error : `Request failed (HTTP ${res.status})`;
      throw new ApiError(res.status, message, payload.code, payload.details, {
        hint: typeof payload.hint === 'string' ? payload.hint : undefined,
        suggestion: typeof payload.suggestion === 'string' ? payload.suggestion : undefined,
      });
    }
    throw new ApiError(
      res.status,
      nonJsonErrorMessage(res.status, text),
      res.status >= 500 ? 'server_unreachable' : undefined,
    );
  }

  if (json === null && text) {
    // 200 mit HTML (z. B. SPA-Fallback statt API) – nicht als Daten durchreichen.
    throw new ApiError(res.status, 'Unexpected response from server (not JSON).', 'invalid_response');
  }

  return json as T;
}

/** Formatiert das `details`-Array aus Validierungsfehlern (zod) zu lesbaren Zeilen. */
function formatDetails(details: unknown): string {
  if (!Array.isArray(details)) return '';
  return details
    .map((d) => {
      if (!d || typeof d !== 'object') return '';
      const entry = d as { path?: unknown; message?: unknown };
      if (typeof entry.message !== 'string') return '';
      return entry.path ? `${String(entry.path)}: ${entry.message}` : entry.message;
    })
    .filter(Boolean)
    .join('\n');
}

/** Normalisiert beliebige Fehler zu einer anzeigbaren Meldung. */
export function toErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof ApiError) {
    const details = formatDetails(error.details);
    return details ? `${error.message}\n${details}` : error.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

/** Für Stellen mit eigenem fetch (Downloads, PATCH): Netzwerkfehler wie in apiRequest übersetzen. */
export function toNetworkError(err: unknown): unknown {
  if (isAbortError(err)) return err;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return new ApiError(0, offline ? OFFLINE_MESSAGE : SERVER_UNREACHABLE_MESSAGE, offline ? 'offline' : 'network_error');
}

/** Für Stellen mit eigenem fetch: Fehlerantwort (JSON oder Proxy-HTML) in einen ApiError übersetzen. */
export async function apiErrorFromResponse(res: Response): Promise<ApiError> {
  const { json, text } = await parseResponseBody(res);
  if (json && typeof json === 'object') {
    const payload = json as { error?: unknown; code?: string; details?: unknown };
    const message = typeof payload.error === 'string' && payload.error ? payload.error : `Request failed (HTTP ${res.status})`;
    return new ApiError(res.status, message, payload.code, payload.details);
  }
  return new ApiError(res.status, nonJsonErrorMessage(res.status, text), res.status >= 500 ? 'server_unreachable' : undefined);
}

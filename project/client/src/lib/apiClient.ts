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

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
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

async function parseResponseBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    return text ? { error: text } : null;
  }
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Führt einen API-Request aus und wirft bei Fehlern einen `ApiError`.
 * Das Backend antwortet einheitlich mit `{ error, code, details? }`.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, signal, headers = {} } = options;

  const res = await fetch(path, {
    method,
    signal,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const data = await parseResponseBody(res);

  if (!res.ok) {
    const payload = (data ?? {}) as { error?: string; code?: string; details?: unknown };
    throw new ApiError(
      res.status,
      payload.error || `Request failed (HTTP ${res.status})`,
      payload.code,
      payload.details,
    );
  }

  return data as T;
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

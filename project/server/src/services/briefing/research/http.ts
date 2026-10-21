/**
 * Client Pre-Briefing – HTTP-Zugriff für die Recherche.
 * Alle Abrufe laufen über safeFetch (SSRF-Schutz: nur öffentliche IPs, IP-Pinning, Redirect-Prüfung).
 * Tests injizieren einen eigenen `HttpGet`.
 */
import { safeFetch } from '../../../utils/safeFetch.js';

export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export interface HttpResponse {
  status: number;
  /** Finale URL nach Redirects. */
  url: string;
  contentType: string;
  text: string;
}

export interface HttpGetOptions {
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
}

export type HttpGet = (url: string, opts?: HttpGetOptions) => Promise<HttpResponse>;

export const defaultHttpGet: HttpGet = async (url, opts = {}) => {
  const res = await safeFetch(url, {
    timeoutMs: opts.timeoutMs ?? 15_000,
    maxBodyBytes: opts.maxBytes ?? 3 * 1024 * 1024,
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...opts.headers,
    },
  });
  const ct = res.headers['content-type'];
  return {
    status: res.status,
    url: res.url,
    contentType: String(Array.isArray(ct) ? ct[0] : ct ?? ''),
    text: res.text,
  };
};

/** GET + JSON-Parse; null bei HTTP-Fehler oder kaputtem JSON. */
export async function getJson<T>(httpGet: HttpGet, url: string, opts?: HttpGetOptions): Promise<T | null> {
  try {
    const res = await httpGet(url, { ...opts, headers: { Accept: 'application/json', ...opts?.headers } });
    if (res.status < 200 || res.status >= 300) return null;
    return JSON.parse(res.text) as T;
  } catch {
    return null;
  }
}

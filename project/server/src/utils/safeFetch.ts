import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import zlib from 'node:zlib';
import { resolvePublicAddresses, sanitizeUrl, type ResolvedAddress } from './sanitize.js';

/**
 * SSRF-sicheres HTTP(S)-GET für fremdgesteuerte URLs.
 *
 * - Hostname wird genau EINMAL aufgelöst und geprüft (alle Records öffentlich).
 * - Die Verbindung wird per eigener `lookup`-Funktion mit genau dieser geprüften IP
 *   aufgebaut (IP-Pinning) → kein zweites DNS-Lookup, kein DNS-Rebinding/TOCTOU.
 *   TLS (SNI + Zertifikatsprüfung) läuft weiterhin gegen den Original-Hostnamen.
 * - Redirects werden manuell verfolgt; jede Station wird erneut geprüft und gepinnt.
 *
 * Bewusst mit node:http/https statt undici, da `undici` nicht als Dependency vorliegt.
 */

export interface SafeFetchOptions {
  /** Gesamt-Timeout über alle Redirect-Stationen hinweg. */
  timeoutMs: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  /** Obergrenze für den (dekomprimierten) Body. */
  maxBodyBytes?: number;
}

export interface SafeFetchResponse {
  status: number;
  ok: boolean;
  url: string;
  headers: http.IncomingHttpHeaders;
  text: string;
}

const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;
const RETRYABLE_CONNECT_ERRORS = new Set(['ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'ECONNRESET', 'EADDRNOTAVAIL']);

function pinnedLookup(pinned: ResolvedAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options?.all) {
      (callback as unknown as (
        err: NodeJS.ErrnoException | null,
        addresses: { address: string; family: number }[],
      ) => void)(null, [{ address: pinned.address, family: pinned.family }]);
      return;
    }
    callback(null, pinned.address, pinned.family);
  };
}

function decode(res: http.IncomingMessage): NodeJS.ReadableStream {
  const enc = String(res.headers['content-encoding'] ?? '').toLowerCase().trim();
  if (enc === 'gzip' || enc === 'x-gzip') return res.pipe(zlib.createGunzip());
  if (enc === 'deflate') return res.pipe(zlib.createInflate());
  if (enc === 'br') return res.pipe(zlib.createBrotliDecompress());
  return res;
}

function requestOnce(
  url: URL,
  pinned: ResolvedAddress,
  headers: Record<string, string>,
  signal: AbortSignal,
  maxBodyBytes: number,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; text: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(
      url,
      {
        method: 'GET',
        headers: { 'Accept-Encoding': 'gzip, deflate, br', ...headers },
        lookup: pinnedLookup(pinned),
        // Kein Keep-Alive-Pool: sonst könnte eine Socket-Wiederverwendung die Pinning-Logik umgehen.
        agent: false,
        signal,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, headers: res.headers, text: '' });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        const body = decode(res);
        body.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBodyBytes) {
            req.destroy(new Error('Response body too large'));
            return;
          }
          chunks.push(chunk);
        });
        body.on('end', () =>
          resolve({ status, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }),
        );
        body.on('error', (err) => {
          req.destroy();
          reject(err);
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

export async function safeFetch(input: string, opts: SafeFetchOptions): Promise<SafeFetchResponse> {
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxBodyBytes = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Timeout')), opts.timeoutMs);

  try {
    let current = input;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const safeUrl = sanitizeUrl(current);
      if (!safeUrl) throw new Error(`Blocked URL: ${current}`);
      const url = new URL(safeUrl);

      const aborted = new Promise<never>((_, reject) => {
        if (controller.signal.aborted) reject(new Error('Timeout'));
        controller.signal.addEventListener('abort', () => reject(new Error('Timeout')), { once: true });
      });
      // Verhindert eine unbehandelte Rejection, falls der Timeout erst nach dem DNS-Schritt feuert.
      aborted.catch(() => {});
      const addresses = await Promise.race([resolvePublicAddresses(url.hostname), aborted]);
      if (!addresses) throw new Error(`Blocked URL (private/unresolvable address): ${current}`);

      // IPv4 zuerst (viele Hosts haben AAAA-Records ohne erreichbares IPv6), dann der Reihe
      // nach probieren – jede Adresse ist bereits als öffentlich geprüft und wird gepinnt.
      const ordered = [...addresses].sort((a, b) => a.family - b.family);
      let res: Awaited<ReturnType<typeof requestOnce>> | undefined;
      let lastErr: unknown;
      for (const addr of ordered) {
        try {
          res = await requestOnce(url, addr, opts.headers ?? {}, controller.signal, maxBodyBytes);
          break;
        } catch (err) {
          lastErr = err;
          // Nur bei Verbindungsfehlern die nächste Adresse probieren – nicht bei Fehlern der Antwort selbst.
          const code = (err as NodeJS.ErrnoException)?.code;
          if (controller.signal.aborted || !code || !RETRYABLE_CONNECT_ERRORS.has(code)) break;
        }
      }
      if (!res) throw lastErr instanceof Error ? lastErr : new Error('Request failed');

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.location;
        if (!location) throw new Error(`HTTP ${res.status} ohne Location-Header`);
        current = new URL(location, url).toString();
        continue;
      }

      return {
        status: res.status,
        ok: res.status >= 200 && res.status < 300,
        url: url.toString(),
        headers: res.headers,
        text: res.text,
      };
    }
    throw new Error('Zu viele Redirects');
  } finally {
    clearTimeout(timeout);
  }
}

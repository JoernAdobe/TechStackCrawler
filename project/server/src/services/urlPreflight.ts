/**
 * Preflight vor dem teuren Scrape: schneller DNS-Lookup + kurzer HTTP-Probe.
 *
 * Ziel: offensichtliche Nutzerfehler (vertippte Domain, Seite existiert nicht) in Sekunden
 * statt nach 60 s Scraper-Timeout melden – inkl. "Did you mean …?".
 *
 * Bewusst konservativ: Eine Seite, die nur langsam antwortet oder Bots ausbremst, wird NICHT
 * blockiert, solange es keinen klaren Tippfehler-Kandidaten gibt – dann übernimmt der Scraper
 * mit seinen eigenen Fallbacks. Blockiert wird nur bei
 *   - NXDOMAIN (Domain existiert nicht),
 *   - DNS-Antwort mit privater Adresse (SSRF-Schutz, wie sanitizeUrlWithDns),
 *   - aktiv abgewiesener Verbindung (refused/reset/unreachable) auf http UND https,
 *   - Timeout auf http UND https, wenn eine ähnliche bekannte Domain existiert.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { isPrivateIpAddress } from '../utils/sanitize.js';
import { safeFetch } from '../utils/safeFetch.js';
import { findDomainSuggestion, normalizeHost } from './domainSuggest.js';

export type PreflightErrorCode = 'domain_not_found' | 'dns_failed' | 'url_disallowed' | 'site_unreachable';

export type PreflightResult =
  | { ok: true }
  | { ok: false; code: PreflightErrorCode; message: string; hint: string; suggestion?: string };

export type ProbeOutcome = 'reachable' | 'timeout' | 'refused' | 'tls' | 'blocked' | 'error';

export interface PreflightDeps {
  lookup: (host: string) => Promise<Array<{ address: string; family: number }>>;
  probe: (url: string, timeoutMs: number) => Promise<ProbeOutcome>;
  suggest: (host: string) => Promise<string | null>;
}

export const DNS_TIMEOUT_MS = 5_000;
export const PROBE_TIMEOUT_MS = 8_000;

const NOT_FOUND_CODES = new Set(['ENOTFOUND', 'ENODATA', 'EAI_NONAME', 'EAI_NODATA']);
const REFUSED_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'EADDRNOTAVAIL', 'EPIPE']);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('DNS timeout'), { code: 'ETIMEOUT' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Ordnet einen Fehler aus safeFetch einer Probe-Kategorie zu. */
export function classifyProbeError(err: unknown): ProbeOutcome {
  const e = err as NodeJS.ErrnoException | undefined;
  const code = String(e?.code ?? '');
  const msg = String(e?.message ?? '');
  // Body zu groß / Redirect-Grenze → der Server HAT geantwortet.
  if (/Response body too large|Zu viele Redirects|ohne Location-Header/.test(msg)) return 'reachable';
  if (/^Blocked URL/.test(msg)) return 'blocked';
  if (code === 'ABORT_ERR' || code === 'ETIMEDOUT' || /timeout|aborted/i.test(msg)) return 'timeout';
  if (REFUSED_CODES.has(code)) return 'refused';
  if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|HOSTNAME_MISMATCH/i.test(code + msg)) return 'tls';
  return 'error';
}

async function defaultProbe(url: string, timeoutMs: number): Promise<ProbeOutcome> {
  try {
    await safeFetch(url, {
      timeoutMs,
      maxBodyBytes: 64 * 1024,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.8,de;q=0.6',
      },
    });
    // Jeder HTTP-Status zählt: auch 403/503 (Bot-Schutz) heißt "Server existiert".
    return 'reachable';
  } catch (err) {
    return classifyProbeError(err);
  }
}

const defaultDeps: PreflightDeps = {
  lookup: (host) => dnsLookup(host, { all: true, verbatim: true }),
  probe: defaultProbe,
  suggest: findDomainSuggestion,
};

function hintFor(suggestion: string | null | undefined, fallback: string): string {
  return suggestion ? `Did you mean ${suggestion}?` : fallback;
}

/** Variante mit anderem Schema (http ↔ https), Pfad/Query bleiben erhalten. */
function otherScheme(url: URL): string {
  const copy = new URL(url.toString());
  copy.protocol = url.protocol === 'https:' ? 'http:' : 'https:';
  return copy.toString();
}

export async function preflightUrl(input: string, deps: Partial<PreflightDeps> = {}): Promise<PreflightResult> {
  if (process.env.URL_PREFLIGHT === '0' && Object.keys(deps).length === 0) return { ok: true };
  const d: PreflightDeps = { ...defaultDeps, ...deps };
  const url = new URL(input);
  const host = url.hostname.replace(/\.+$/, '');
  const display = normalizeHost(host);

  // IP-Literale: kein DNS nötig, SSRF-Prüfung macht sanitizeUrl bereits.
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    let records: Array<{ address: string; family: number }>;
    try {
      records = await withTimeout(d.lookup(host), DNS_TIMEOUT_MS);
    } catch (err) {
      const code = String((err as NodeJS.ErrnoException)?.code ?? '');
      if (NOT_FOUND_CODES.has(code)) {
        const suggestion = (await d.suggest(host).catch(() => null)) ?? (await wwwVariant(host, d));
        return {
          ok: false,
          code: 'domain_not_found',
          message: `The domain "${display}" does not exist.`,
          hint: hintFor(suggestion, 'Please check the spelling of the URL.'),
          ...(suggestion ? { suggestion } : {}),
        };
      }
      return {
        ok: false,
        code: 'dns_failed',
        message: `The domain "${display}" could not be looked up right now.`,
        hint: 'Please check the URL and try again in a moment.',
      };
    }
    if (records.length === 0) {
      return { ok: false, code: 'domain_not_found', message: `The domain "${display}" does not exist.`, hint: 'Please check the spelling of the URL.' };
    }
    if (records.some((r) => isPrivateIpAddress(r.address))) {
      return {
        ok: false,
        code: 'url_disallowed',
        message: `"${display}" points to a private or internal address and cannot be analyzed.`,
        hint: 'Enter a public website domain.',
      };
    }
  }

  const outcomes = await Promise.all([
    d.probe(url.toString(), PROBE_TIMEOUT_MS),
    d.probe(otherScheme(url), PROBE_TIMEOUT_MS),
  ]);
  // TLS-/Redirect-/sonstige Fehler: Server existiert vermutlich – der Scraper soll es versuchen.
  if (outcomes.some((o) => o !== 'timeout' && o !== 'refused')) return { ok: true };

  const suggestion = await d.suggest(host).catch(() => null);
  const allRefused = outcomes.every((o) => o === 'refused');
  if (!allRefused && !suggestion) return { ok: true };

  return {
    ok: false,
    code: 'site_unreachable',
    message: allRefused
      ? `The website "${display}" refused the connection.`
      : `The website "${display}" did not respond within ${PROBE_TIMEOUT_MS / 1000} seconds.`,
    hint: hintFor(suggestion, 'Please check the URL for typos or try again later.'),
    ...(suggestion ? { suggestion } : {}),
  };
}

/** Wenn nur die www-Variante existiert (oder umgekehrt), diese vorschlagen. */
async function wwwVariant(host: string, d: PreflightDeps): Promise<string | null> {
  const alt = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
  if (!alt.includes('.')) return null;
  try {
    const records = await withTimeout(d.lookup(alt), DNS_TIMEOUT_MS);
    return records.length > 0 && !records.some((r) => isPrivateIpAddress(r.address)) ? alt : null;
  } catch {
    return null;
  }
}

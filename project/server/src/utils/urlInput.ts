/**
 * Syntaktische Prüfung einer vom Nutzer eingegebenen Website-URL – ohne I/O.
 * Liefert statt eines nackten `null` einen konkreten Fehlercode + englische Meldung,
 * damit die UI dem Nutzer sagen kann, WAS an der Eingabe nicht stimmt.
 *
 * Die SSRF-Regeln bleiben in `sanitize.ts` (sanitizeUrl/sanitizeUrlWithDns) – hier wird
 * `sanitizeUrl` nur zusätzlich aufgerufen, nie ersetzt.
 */
import { sanitizeUrl } from './sanitize.js';

export type UrlInputErrorCode =
  | 'url_empty'
  | 'url_too_long'
  | 'multiple_urls'
  | 'url_whitespace'
  | 'unsupported_scheme'
  | 'url_credentials'
  | 'invalid_url'
  | 'invalid_host'
  | 'invalid_tld'
  | 'url_disallowed';

export type UrlInputResult =
  | { ok: true; url: string; hostname: string }
  | { ok: false; code: UrlInputErrorCode; message: string; hint?: string; suggestion?: string };

export const MAX_URL_INPUT_LENGTH = 2048;

/** Häufige Tippfehler in der Domain-Endung (keine echten TLDs). */
const TLD_TYPOS: Record<string, string> = {
  con: 'com', cmo: 'com', ocm: 'com', cpm: 'com', vom: 'com', xom: 'com', comm: 'com',
  coom: 'com', ccom: 'com', clm: 'com', cim: 'com', nte: 'net', ent: 'net', ogr: 'org',
  rog: 'org', orgg: 'org', dee: 'de', ed: 'de',
};

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

function fail(
  code: UrlInputErrorCode,
  message: string,
  hint?: string,
  suggestion?: string,
): UrlInputResult {
  return { ok: false, code, message, ...(hint ? { hint } : {}), ...(suggestion ? { suggestion } : {}) };
}

/** Sieht ein Token wie eine Domain/URL aus (für die Erkennung mehrerer URLs)? */
function looksLikeUrl(token: string): boolean {
  return /^(https?:\/\/)?[^\s/.,;]+\.[^\s/.,;]{2,}/i.test(token);
}

export function validateUrlInput(input: unknown): UrlInputResult {
  if (typeof input !== 'string') return fail('url_empty', 'Please enter a website URL.');
  // Umschließende Anführungszeichen/spitze Klammern aus Copy & Paste (Mail, Slack) entfernen.
  let raw = input.trim().replace(/^[<"'“‘]+|[>"'”’]+$/g, '').trim();
  if (!raw) return fail('url_empty', 'Please enter a website URL.', 'For example: adobe.com');
  if (raw.length > MAX_URL_INPUT_LENGTH) {
    return fail('url_too_long', `The URL is too long (maximum ${MAX_URL_INPUT_LENGTH} characters).`);
  }

  const tokens = raw.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length > 1 && tokens.filter(looksLikeUrl).length > 1) {
    return fail(
      'multiple_urls',
      'Please enter only one URL at a time.',
      'To analyze several websites at once, use the "Account / Bulk" tab.',
    );
  }
  if (/\s/.test(raw)) {
    return fail('url_whitespace', 'URLs cannot contain spaces.', 'Remove the spaces and try again.');
  }

  // Vertipptes Schema reparieren: "https:/x", "http//x", "https:\\x".
  raw = raw.replace(/^(https?):?[\\/]{1,3}(?=[^\\/])/i, '$1://');
  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https') {
    return fail('unsupported_scheme', `"${scheme}://" URLs are not supported.`, 'Only http:// and https:// websites can be analyzed.');
  }
  if (!scheme && /^(mailto|javascript|data|file|tel|ftp|about|chrome|blob):/i.test(raw)) {
    return fail('unsupported_scheme', 'This is not a website address.', 'Enter a domain such as example.com.');
  }
  if (!scheme) raw = `https://${raw}`;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return fail('invalid_url', 'This does not look like a valid website address.', 'Check the spelling, e.g. example.com.');
  }
  if (parsed.username || parsed.password) {
    return fail('url_credentials', 'URLs with a username or password are not supported.', 'Remove the "user:password@" part.');
  }

  // Trailing Dot ("bmw.com.") ist gültige FQDN-Schreibweise – für Anzeige/Dedupe entfernen.
  const hostname = parsed.hostname.replace(/\.+$/, '');
  parsed.hostname = hostname;
  parsed.hash = '';

  if (!sanitizeUrl(parsed.toString())) {
    return fail(
      'url_disallowed',
      'Local, private or internal addresses cannot be analyzed.',
      'Enter a public website domain such as example.com.',
    );
  }

  const isIpLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  if (!isIpLiteral) {
    const labels = hostname.split('.');
    if (labels.length < 2) {
      return fail('invalid_host', `"${hostname}" is missing a domain ending such as .com or .de.`, `Add a domain ending, e.g. ${hostname}.com or ${hostname}.de.`);
    }
    if (hostname.length > 253 || labels.some((l) => !LABEL.test(l))) {
      return fail('invalid_host', `"${hostname}" is not a valid domain name.`, 'Domains may only contain letters, digits, dots and hyphens.');
    }
    const tld = labels[labels.length - 1];
    const fixed = TLD_TYPOS[tld];
    if (fixed) {
      const suggestion = [...labels.slice(0, -1), fixed].join('.');
      return fail('invalid_tld', `".${tld}" is not a valid domain ending.`, `Did you mean ${suggestion}?`, suggestion);
    }
    if (!TLD.test(tld)) {
      return fail('invalid_tld', `".${tld}" is not a valid domain ending.`, 'Use a domain ending such as .com, .de or .co.uk.');
    }
  }

  return { ok: true, url: parsed.toString(), hostname };
}

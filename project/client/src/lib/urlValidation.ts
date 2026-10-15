/**
 * Client-seitige Vorprüfung der URL-Eingabe (Spiegel von server/src/utils/urlInput.ts).
 * Fängt offensichtliche Fehler ab, bevor ein Request rausgeht. Der Server bleibt
 * maßgeblich (SSRF-Schutz, DNS, Erreichbarkeit).
 */

export type UrlCheck =
  | { ok: true; url: string; hostname: string }
  | { ok: false; message: string; hint?: string; suggestion?: string };

const TLD_TYPOS: Record<string, string> = {
  con: 'com', cmo: 'com', ocm: 'com', cpm: 'com', vom: 'com', xom: 'com', comm: 'com',
  coom: 'com', ccom: 'com', clm: 'com', cim: 'com', nte: 'net', ent: 'net', ogr: 'org',
  rog: 'org', orgg: 'org', dee: 'de', ed: 'de',
};
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host.startsWith('[') || host.includes(':')) return true;
  const m = host.match(IPV4);
  if (!m) return false;
  const [a, b] = m.slice(1).map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

const looksLikeUrl = (t: string) => /^(https?:\/\/)?[^\s/.,;]+\.[^\s/.,;]{2,}/i.test(t);

export function checkUrlInput(input: string): UrlCheck {
  let raw = input.trim().replace(/^[<"'“‘]+|[>"'”’]+$/g, '').trim();
  if (!raw) return { ok: false, message: 'Please enter a website URL.', hint: 'For example: adobe.com' };
  if (raw.length > 2048) return { ok: false, message: 'The URL is too long (maximum 2048 characters).' };

  const tokens = raw.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length > 1 && tokens.filter(looksLikeUrl).length > 1) {
    return {
      ok: false,
      message: 'Please enter only one URL at a time.',
      hint: 'To analyze several websites at once, use the "Account / Bulk" tab.',
    };
  }
  if (/\s/.test(raw)) return { ok: false, message: 'URLs cannot contain spaces.', hint: 'Remove the spaces and try again.' };

  raw = raw.replace(/^(https?):?[\\/]{1,3}(?=[^\\/])/i, '$1://');
  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https') {
    return { ok: false, message: `"${scheme}://" URLs are not supported.`, hint: 'Only http:// and https:// websites can be analyzed.' };
  }
  if (!scheme && /^(mailto|javascript|data|file|tel|ftp|about|chrome|blob):/i.test(raw)) {
    return { ok: false, message: 'This is not a website address.', hint: 'Enter a domain such as example.com.' };
  }
  if (!scheme) raw = `https://${raw}`;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, message: 'This does not look like a valid website address.', hint: 'Check the spelling, e.g. example.com.' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, message: 'URLs with a username or password are not supported.', hint: 'Remove the "user:password@" part.' };
  }
  const hostname = parsed.hostname.replace(/\.+$/, '');
  if (isPrivateHost(hostname)) {
    return { ok: false, message: 'Local, private or internal addresses cannot be analyzed.', hint: 'Enter a public website domain such as example.com.' };
  }
  if (!IPV4.test(hostname)) {
    const labels = hostname.split('.');
    if (labels.length < 2) {
      return {
        ok: false,
        message: `"${hostname}" is missing a domain ending such as .com or .de.`,
        hint: `Add a domain ending, e.g. ${hostname}.com or ${hostname}.de.`,
      };
    }
    if (hostname.length > 253 || labels.some((l) => !LABEL.test(l))) {
      return { ok: false, message: `"${hostname}" is not a valid domain name.`, hint: 'Domains may only contain letters, digits, dots and hyphens.' };
    }
    const tld = labels[labels.length - 1];
    if (TLD_TYPOS[tld]) {
      const suggestion = [...labels.slice(0, -1), TLD_TYPOS[tld]].join('.');
      return { ok: false, message: `".${tld}" is not a valid domain ending.`, hint: `Did you mean ${suggestion}?`, suggestion };
    }
    if (!TLD.test(tld)) {
      return { ok: false, message: `".${tld}" is not a valid domain ending.`, hint: 'Use a domain ending such as .com, .de or .co.uk.' };
    }
  }
  parsed.hostname = hostname;
  parsed.hash = '';
  return { ok: true, url: parsed.toString(), hostname };
}

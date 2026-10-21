/** Gemeinsame HTML-/Datums-/Domain-Helfer der Recherche (rein, ohne I/O). */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon YYYY" aus einem Datum/ISO-String; null bei ungültigem Wert. */
export function formatMonYear(value: string | Date | undefined | null): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  if (year < 1990 || year > 2100) return null;
  return `${MONTHS[d.getUTCMonth()]} ${year}`;
}

export const MON_YEAR_RE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (19|20)\d\d$/;

export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => safeCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => safeCodePoint(Number.parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&');
}

function safeCodePoint(n: number): string {
  try {
    return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : '';
  } catch {
    return '';
  }
}

/** Entfernt Tags und normalisiert Whitespace. */
export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<\/?(?:b|i|em|strong|span|a|u|small|sup|sub|mark|abbr)\b[^>]*>/gi, '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  const v = m?.[1] ?? m?.[2] ?? m?.[3];
  return v === undefined ? undefined : decodeEntities(v);
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu', 'ltd', 'plc', 'or', 'ne', 'go']);

/** Grobe registrierbare Domain (ohne Public-Suffix-Liste): www.shop.porsche.co.uk → porsche.co.uk. */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  if (tld.length === 2 && SECOND_LEVEL.has(sld)) return parts.slice(-3).join('.');
  return parts.slice(-2).join('.');
}

/** Markenlabel einer Domain: porsche.co.uk → porsche. */
export function brandLabel(domain: string): string {
  return registrableDomain(domain).split('.')[0] ?? '';
}

/** true, wenn `host` gleich einer der Domains ist oder eine Subdomain davon. */
export function hostMatches(host: string, domains: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  return domains.some((d) => h === d || h.endsWith(`.${d}`));
}

/** Kanonische Form für den URL-Abgleich (Quellen-Guardrail). */
export function normalizeUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) {
      if (/^utm_|^gclid$|^fbclid$|^mc_/i.test(k)) u.searchParams.delete(k);
    }
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '') || '';
    const query = u.searchParams.toString();
    return `${host}${path}${query ? `?${query}` : ''}`;
  } catch {
    return null;
  }
}

/** Schlüssel wie im Report-Validator: Firmenname klein, nur a–z/0–9. */
export function clientKey(companyName: string): string {
  return companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Spiegelt validate-report.py `client_owned`: deklarierte Domain oder Host-Label enthält den Firmennamen. */
export function isClientOwned(url: string, clientDomains: readonly string[], key: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  if (hostMatches(host, clientDomains)) return true;
  if (!key) return false;
  return host
    .split('.')
    .slice(0, -1)
    .some((label) => {
      const lab = label.replace(/-/g, '');
      return key.length >= 5 ? lab.includes(key) : lab.startsWith(key);
    });
}

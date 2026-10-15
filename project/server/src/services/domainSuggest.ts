/**
 * "Did you mean …?" für vertippte Domains (bwm.com → bmw.com).
 *
 * Kandidaten: Domains früherer Analysen (DB) + eine kleine Liste großer Marken.
 * Vergleich per Damerau-Levenshtein (Optimal String Alignment, Buchstabendreher = 1).
 * Vorschläge nur bei gleicher Domain-Endung, damit z. B. bmw.at nie zu bmw.ca "korrigiert" wird.
 */
import { getPool } from '../db/index.js';

export const KNOWN_DOMAINS: readonly string[] = [
  'adobe.com', 'bmw.com', 'bmw.de', 'mercedes-benz.com', 'mercedes-benz.de', 'audi.com', 'audi.de',
  'volkswagen.com', 'volkswagen.de', 'porsche.com', 'tesla.com', 'toyota.com', 'ford.com', 'volvo.com',
  'nike.com', 'adidas.com', 'adidas.de', 'puma.com', 'airbnb.com', 'shopify.com', 'amazon.com',
  'amazon.de', 'google.com', 'apple.com', 'microsoft.com', 'facebook.com', 'instagram.com',
  'linkedin.com', 'youtube.com', 'netflix.com', 'spotify.com', 'zalando.de', 'otto.de', 'siemens.com',
  'sap.com', 'allianz.de', 'allianz.com', 'ergo.de', 'deutsche-bank.de', 'commerzbank.de',
  'telekom.de', 'vodafone.de', 'lufthansa.com', 'bahn.de', 'ikea.com', 'lidl.de', 'rewe.de',
  'edeka.de', 'mediamarkt.de', 'douglas.de', 'zara.com', 'booking.com', 'expedia.com', 'samsung.com',
  'sony.com', 'coca-cola.com', 'nestle.com', 'unilever.com', 'loreal.com', 'bosch.com', 'basf.com',
  'bayer.com', 'henkel.com', 'continental.com', 'dhl.com', 'dhl.de', 'ebay.com', 'ebay.de',
  'paypal.com', 'visa.com', 'mastercard.com', 'walmart.com', 'target.com', 'bestbuy.com',
  'starbucks.com', 'mcdonalds.com', 'salesforce.com', 'oracle.com', 'ibm.com', 'hubspot.com',
  'wikipedia.org', 'faz.net', 'spiegel.de', 'zeit.de', 'sueddeutsche.de', 'boehringer-ingelheim.com',
  'atruvia.de', 'swisscom.ch', 'migros.ch', 'orf.at', 'redbull.com',
];

/** Damerau-Levenshtein (OSA): Einfügen, Löschen, Ersetzen und Vertauschen benachbarter Zeichen. */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Hostname → vergleichbare Form (klein, ohne www., ohne Trailing Dot). */
export function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.+$/, '').replace(/^www\./, '');
}

function hostFromUrl(value: string): string | null {
  try {
    return normalizeHost(new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname);
  } catch {
    return null;
  }
}

/** Letztes Label = Domain-Endung; Rest = der Teil, in dem wir Tippfehler suchen. */
function splitHost(host: string): { name: string; tld: string } {
  const idx = host.lastIndexOf('.');
  return idx < 0 ? { name: host, tld: '' } : { name: host.slice(0, idx), tld: host.slice(idx + 1) };
}

/**
 * Bester Vorschlag für `hostname` aus `candidates` oder `null`.
 * Erlaubte Distanz: max. 2, bei kurzen Namen (< 6 Zeichen) max. 1; Namen < 3 Zeichen nie.
 */
export function suggestDomain(hostname: string, candidates: Iterable<string>): string | null {
  const host = normalizeHost(hostname);
  const { name, tld } = splitHost(host);
  if (name.length < 3 || !tld) return null;
  const maxDistance = name.length < 6 ? 1 : 2;

  let best: { host: string; dist: number } | null = null;
  const seen = new Set<string>();
  for (const raw of candidates) {
    const cand = raw.includes('/') ? hostFromUrl(raw) : normalizeHost(raw);
    if (!cand || cand === host || seen.has(cand)) continue;
    seen.add(cand);
    const c = splitHost(cand);
    if (c.tld !== tld || c.name.length < 3) continue;
    const dist = damerauLevenshtein(name, c.name);
    if (dist <= maxDistance && (!best || dist < best.dist)) best = { host: cand, dist };
  }
  return best?.host ?? null;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { at: number; hosts: string[] } | null = null;

/** Domains der letzten Analysen (gecacht, Fehler → leere Liste: Vorschläge sind nur Komfort). */
export async function loadAnalyzedDomains(limit = 500): Promise<string[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.hosts;
  const db = getPool();
  if (!db) return [];
  try {
    const { rows } = await db.execute('SELECT url FROM analyses ORDER BY id DESC LIMIT ?', [limit]);
    const hosts = new Set<string>();
    for (const row of rows as Array<{ url?: unknown }>) {
      if (typeof row.url !== 'string') continue;
      const h = hostFromUrl(row.url);
      if (h) hosts.add(h);
    }
    cache = { at: Date.now(), hosts: [...hosts] };
    return cache.hosts;
  } catch (err) {
    console.warn('[domainSuggest] could not load analyzed domains:', err instanceof Error ? err.message : err);
    return [];
  }
}

/** Vorschlag aus bekannten Marken + bisherigen Analysen. */
export async function findDomainSuggestion(hostname: string): Promise<string | null> {
  const analyzed = await loadAnalyzedDomains();
  // Bekannte Marken zuerst: bei gleicher Distanz gewinnt der stabile Listeneintrag.
  return suggestDomain(hostname, [...KNOWN_DOMAINS, ...analyzed]);
}

/** Nur für Tests. */
export function resetDomainCache(): void {
  cache = null;
}

import { scrapePage, type ScrapedData } from './scraper.js';
import { detectTechnologies } from './detector.js';
import type { DetectedTech } from './customDetectors.js';
import { sanitizeUrlWithDns } from '../utils/sanitize.js';

/**
 * Repräsentativer Multi-Page-Crawl (TechCase-Sektionen 03 & 07).
 *
 * Die Hauptanalyse scannt nur die eingegebene Seite. Marketing-/Commerce-Technologien
 * (Payment, Search, CDP-Tags, Support-Chat …) tauchen aber oft erst auf Produkt-,
 * Checkout- oder Blog-Seiten auf. Dieser Schritt scannt best-effort einige wenige
 * repräsentative Unterseiten und führt die Detections zusammen — beschränkt und
 * ausfallsicher, sodass ein Fehler die Hauptanalyse nie bricht.
 */

const MAX_EXTRA_PAGES = Math.max(0, Math.min(8, parseInt(process.env.MULTI_PAGE_MAX || '5', 10) || 5));
/** Parallel laufende Browser-Worker (je ~300–500 MB RAM). */
const CRAWL_CONCURRENCY = Math.max(1, Math.min(3, parseInt(process.env.MULTI_PAGE_CONCURRENCY || '2', 10) || 2));

/** Ein Muster pro „Seitentyp" – für Vielfalt statt drei Produktseiten. Reihenfolge = Priorität. */
const PAGE_TYPE_PATTERNS: RegExp[] = [
  /\/(product|products|produkt|produkte|p|item|dp)(\/|$|\?)/i,
  /\/(cart|checkout|warenkorb|basket|bag)(\/|$|\?)/i,
  /\/(login|signin|sign-in|anmelden|account|konto|mein-konto|my-account|register|registrieren)(\/|$|\?)/i,
  /\/(category|categories|kategorie|kategorien|shop|store|collection|models|modelle|fahrzeuge)(\/|$|\?)/i,
  /\/(search|suche)(\/|$|\?)/i,
  /\/(blog|news|article|artikel|magazine|stories|insights)(\/|$|\?)/i,
  /\/(contact|kontakt|support|help|service)(\/|$|\?)/i,
  /\/(pricing|preise|plans|tarife|angebote|offers)(\/|$|\?)/i,
  /\/(about|about-us|ueber-uns|company|unternehmen|team)(\/|$|\?)/i,
];

function hostKey(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Wählt bis zu `limit` repräsentative, gleichhostige Unterseiten aus den auf der
 * Startseite gefundenen Links – höchstens eine pro Seitentyp-Muster.
 */
export function selectRepresentativePages(
  baseUrl: string,
  links: string[],
  limit = MAX_EXTRA_PAGES,
): string[] {
  const baseHost = hostKey(baseUrl);
  if (!baseHost) return [];

  let baseKey = '';
  try {
    const b = new URL(baseUrl);
    baseKey = `${b.origin}${b.pathname}`.replace(/\/+$/, '');
  } catch {
    return [];
  }

  const firstByPattern = new Map<number, string>();
  const seen = new Set<string>();

  for (const link of links) {
    if (!/^https?:\/\//i.test(link)) continue;
    if (hostKey(link) !== baseHost) continue;

    const noHash = link.split('#')[0];
    const key = noHash.replace(/\/+$/, '');
    if (!key || key === baseKey || seen.has(key)) continue;
    seen.add(key);

    const patternIdx = PAGE_TYPE_PATTERNS.findIndex((re) => re.test(noHash));
    if (patternIdx === -1 || firstByPattern.has(patternIdx)) continue;
    firstByPattern.set(patternIdx, noHash);
  }

  return [...firstByPattern.entries()]
    .sort(([a], [b]) => a - b)
    .slice(0, limit)
    .map(([, url]) => url);
}

/**
 * Führt Detections mehrerer Seiten zusammen: Union nach Name, höchste Confidence
 * gewinnt, `weak` fällt weg sobald irgendeine Seite ein starkes Signal liefert,
 * Kategorien und Version werden ergänzt.
 */
export function mergeDetections(
  base: DetectedTech[],
  extra: DetectedTech[],
): DetectedTech[] {
  const byName = new Map<string, DetectedTech>();

  const put = (d: DetectedTech) => {
    const key = d.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, {
        ...d,
        categories: [...d.categories],
        ...(d.evidence ? { evidence: [...d.evidence] } : {}),
      });
      return;
    }
    existing.confidence = Math.max(existing.confidence, d.confidence);
    if (!d.weak) existing.weak = false;
    if (!existing.version && d.version) existing.version = d.version;
    for (const c of d.categories) {
      if (!existing.categories.includes(c)) existing.categories.push(c);
    }
    for (const e of d.evidence ?? []) {
      existing.evidence ??= [];
      if (existing.evidence.includes(e)) continue;
      // Warnungen (⚠) dürfen nicht am Cap scheitern.
      if (e.startsWith('⚠')) existing.evidence = [e, ...existing.evidence].slice(0, 8);
      else if (existing.evidence.length < 8) existing.evidence.push(e);
    }
  };

  for (const d of base) put(d);
  for (const d of extra) put(d);

  return [...byName.values()];
}

export interface EnrichResult {
  detected: DetectedTech[];
  pagesCrawled: string[];
}

export async function enrichWithAdditionalPages(
  baseScraped: ScrapedData,
  baseDetected: DetectedTech[],
  onProgress?: (message: string) => void,
): Promise<EnrichResult> {
  const pages = selectRepresentativePages(baseScraped.finalUrl, baseScraped.links);
  if (pages.length === 0) return { detected: baseDetected, pagesCrawled: [] };

  let merged = baseDetected;
  const results: (DetectedTech[] | null)[] = new Array(pages.length).fill(null);
  let next = 0;

  const scanOne = async (url: string): Promise<DetectedTech[] | null> => {
    try {
      let label = url;
      try {
        label = new URL(url).pathname || url;
      } catch {
        /* keep full url */
      }
      // Links stammen von der fremden Seite → vorab gegen private Ziele prüfen
      // (scrapePage prüft zusätzlich jeden Request und die Remote-IPs).
      const safeUrl = await sanitizeUrlWithDns(url);
      if (!safeUrl) return null;
      onProgress?.(`Scanning additional page: ${label}`);
      const scraped = await scrapePage(safeUrl, () => {});
      return await detectTechnologies(scraped);
    } catch {
      // Best-effort: fehlerhafte Seiten überspringen, Hauptanalyse nie brechen.
      return null;
    }
  };

  const worker = async () => {
    while (next < pages.length) {
      const i = next++;
      results[i] = await scanOne(pages[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CRAWL_CONCURRENCY, pages.length) }, worker));

  const crawled: string[] = [];
  results.forEach((detected, i) => {
    if (!detected) return;
    merged = mergeDetections(merged, detected);
    crawled.push(pages[i]);
  });

  return { detected: merged, pagesCrawled: crawled };
}

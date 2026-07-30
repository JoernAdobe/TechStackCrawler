import { scrapePage, type ScrapedData } from './scraper.js';
import { detectTechnologies } from './detector.js';
import type { DetectedTech } from './customDetectors.js';

/**
 * Repräsentativer Multi-Page-Crawl (TechCase-Sektionen 03 & 07).
 *
 * Die Hauptanalyse scannt nur die eingegebene Seite. Marketing-/Commerce-Technologien
 * (Payment, Search, CDP-Tags, Support-Chat …) tauchen aber oft erst auf Produkt-,
 * Checkout- oder Blog-Seiten auf. Dieser Schritt scannt best-effort einige wenige
 * repräsentative Unterseiten und führt die Detections zusammen — beschränkt und
 * ausfallsicher, sodass ein Fehler die Hauptanalyse nie bricht.
 */

const MAX_EXTRA_PAGES = 3;

/** Ein Muster pro „Seitentyp" – für Vielfalt statt drei Produktseiten. */
const PAGE_TYPE_PATTERNS: RegExp[] = [
  /\/(product|products|produkt|produkte|p|item|dp)(\/|$|\?)/i,
  /\/(cart|checkout|warenkorb|basket|bag)(\/|$|\?)/i,
  /\/(blog|news|article|artikel|magazine|stories|insights)(\/|$|\?)/i,
  /\/(about|about-us|ueber-uns|company|unternehmen|team)(\/|$|\?)/i,
  /\/(category|categories|kategorie|kategorien|shop|store|collection)(\/|$|\?)/i,
  /\/(contact|kontakt|support|help)(\/|$|\?)/i,
  /\/(pricing|preise|plans|tarife)(\/|$|\?)/i,
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

  const selected: string[] = [];
  const usedPatterns = new Set<number>();
  const seen = new Set<string>();

  for (const link of links) {
    if (selected.length >= limit) break;
    if (!/^https?:\/\//i.test(link)) continue;
    if (hostKey(link) !== baseHost) continue;

    const noHash = link.split('#')[0];
    const key = noHash.replace(/\/+$/, '');
    if (!key || key === baseKey || seen.has(key)) continue;

    const patternIdx = PAGE_TYPE_PATTERNS.findIndex((re) => re.test(noHash));
    if (patternIdx === -1 || usedPatterns.has(patternIdx)) continue;

    usedPatterns.add(patternIdx);
    seen.add(key);
    selected.push(noHash);
  }

  return selected;
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
      byName.set(key, { ...d, categories: [...d.categories] });
      return;
    }
    existing.confidence = Math.max(existing.confidence, d.confidence);
    if (!d.weak) existing.weak = false;
    if (!existing.version && d.version) existing.version = d.version;
    for (const c of d.categories) {
      if (!existing.categories.includes(c)) existing.categories.push(c);
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
  const crawled: string[] = [];

  for (const url of pages) {
    try {
      let label = url;
      try {
        label = new URL(url).pathname || url;
      } catch {
        /* keep full url */
      }
      onProgress?.(`Scanning additional page: ${label}`);
      const scraped = await scrapePage(url, () => {});
      const detected = await detectTechnologies(scraped);
      merged = mergeDetections(merged, detected);
      crawled.push(url);
    } catch {
      // Best-effort: fehlerhafte Seiten überspringen, Hauptanalyse nie brechen.
      continue;
    }
  }

  return { detected: merged, pagesCrawled: crawled };
}

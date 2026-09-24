import { safeFetch } from '../utils/safeFetch.js';

const SITEMAP_TIMEOUT_MS = 12_000;
const MAX_URLS = 200;
const LOC_REGEX = /<loc>([^<]+)<\/loc>/gi;
const SITEMAP_PATHS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/sitemap/sitemap.xml',
];

function getBaseUrl(inputUrl: string): string {
  try {
    const u = new URL(inputUrl);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return inputUrl;
  }
}

function extractUrlsFromXml(xml: string): string[] {
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  LOC_REGEX.lastIndex = 0;
  while ((m = LOC_REGEX.exec(xml)) !== null) {
    urls.push(m[1].trim());
  }
  return urls;
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex/i.test(xml) || /<sitemap[\s>]/i.test(xml);
}

/**
 * Holt eine URL mit Timeout. Sitemap-Ziele stammen teils aus robots.txt bzw.
 * Sitemap-Indizes der Gegenstelle und sind damit fremdgesteuert — daher über
 * `safeFetch`: DNS einmal auflösen + prüfen, Verbindung auf die geprüfte IP pinnen
 * (kein DNS-Rebinding), Redirects manuell verfolgen und jede Station neu prüfen.
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  maxRedirects = 5,
): Promise<string> {
  const res = await safeFetch(url, {
    timeoutMs,
    maxRedirects,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; TechStackAnalyzer/1.0; +https://example.com)',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text;
}

async function tryFetchSitemap(baseUrl: string): Promise<string | null> {
  for (const path of SITEMAP_PATHS) {
    const url = `${baseUrl}${path}`;
    try {
      const xml = await fetchWithTimeout(url, SITEMAP_TIMEOUT_MS);
      if (xml && xml.includes('<loc>')) return xml;
    } catch {
      continue;
    }
  }

  try {
    const robotsUrl = `${baseUrl}/robots.txt`;
    const robots = await fetchWithTimeout(robotsUrl, 5000);
    const sitemapMatch = robots.match(/Sitemap:\s*(.+)/i);
    if (sitemapMatch) {
      const sitemapUrl = sitemapMatch[1].trim();
      const xml = await fetchWithTimeout(sitemapUrl, SITEMAP_TIMEOUT_MS);
      if (xml && xml.includes('<loc>')) return xml;
    }
  } catch {
    // ignore
  }

  return null;
}

export async function fetchSitemapUrls(baseUrl: string): Promise<string[]> {
  const origin = getBaseUrl(baseUrl);
  if (!origin.startsWith('http')) return [];

  try {
    let xml = await tryFetchSitemap(origin);
    if (!xml) return [];

    if (isSitemapIndex(xml)) {
      const sitemapLocs = extractUrlsFromXml(xml);
      if (sitemapLocs.length === 0) return [];
      const firstSubSitemap = sitemapLocs[0];
      xml = await fetchWithTimeout(firstSubSitemap, SITEMAP_TIMEOUT_MS);
      if (!xml || !xml.includes('<loc>')) return [];
    }

    const urls = extractUrlsFromXml(xml);
    const unique = [...new Set(urls)].filter((u) => u.startsWith('http'));
    return unique.slice(0, MAX_URLS);
  } catch {
    return [];
  }
}

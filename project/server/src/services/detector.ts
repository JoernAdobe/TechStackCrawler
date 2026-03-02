import type { ScrapedData } from './scraper.js';
import { customDetect, type DetectedTech } from './customDetectors.js';

interface VersionExtractor {
  name: string;
  extract: (s: ScrapedData) => string | undefined;
}

const versionExtractors: VersionExtractor[] = [
  {
    name: 'Angular',
    extract: (s) => s.html.match(/ng-version="([^"]+)"/)?.[1],
  },
  {
    name: 'WordPress',
    extract: (s) => {
      const gen = s.meta['generator']?.find((v) => /WordPress/i.test(v));
      return gen?.match(/WordPress\s+([\d.]+)/i)?.[1];
    },
  },
  {
    name: 'Nginx',
    extract: (s) => {
      for (const v of s.headers['server'] ?? []) {
        const m = v.match(/nginx\/([\d.]+)/i);
        if (m) return m[1];
      }
      return undefined;
    },
  },
];

export type DetectProgressCallback = (message: string) => void;

export async function detectTechnologies(
  scraped: ScrapedData,
  onProgress?: DetectProgressCallback,
): Promise<DetectedTech[]> {
  onProgress?.('Running technology detection…');
  const results = customDetect(scraped);

  for (const tech of results) {
    if (tech.version) continue;
    const extractor = versionExtractors.find(
      (e) => e.name.toLowerCase() === tech.name.toLowerCase(),
    );
    if (extractor) {
      tech.version = extractor.extract(scraped);
    }
  }

  return results;
}

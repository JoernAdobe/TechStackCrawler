import type { ScrapedData } from './scraper.js';
import { customDetect, type DetectedTech } from './customDetectors.js';
import { extractEvidence } from './tagEvidence.js';
import { detectFromDns } from './dnsSignals.js';
import { annotatePreConsent } from './consentAudit.js';

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
  const evidence = extractEvidence(scraped);

  for (const tech of results) {
    const ev = evidence.get(tech.name);
    if (ev) {
      if (ev.evidence.length) tech.evidence = ev.evidence;
      if (!tech.version && ev.version) tech.version = ev.version;
    }
    if (tech.version) continue;
    const extractor = versionExtractors.find(
      (e) => e.name.toLowerCase() === tech.name.toLowerCase(),
    );
    if (extractor) {
      tech.version = extractor.extract(scraped);
    }
  }

  for (const dnsTech of await detectFromDns(scraped)) {
    const existing = results.find((t) => t.name === dnsTech.name);
    if (!existing) {
      results.push(dnsTech);
      continue;
    }
    existing.confidence = Math.max(existing.confidence, dnsTech.confidence);
    existing.weak = false;
    existing.evidence = [...(existing.evidence ?? [])];
    for (const e of dnsTech.evidence ?? []) {
      if (!existing.evidence.includes(e) && existing.evidence.length < 8) existing.evidence.push(e);
    }
  }

  annotatePreConsent(results, scraped.consent, scraped.finalUrl);

  return results;
}

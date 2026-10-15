import { scrapePage } from './scraper.js';
import { detectTechnologies } from './detector.js';
import { enrichWithAdditionalPages } from './multiPageCrawl.js';
import { analyzeWithAI, type AIAnalysisResult } from './ai.js';
import { LlmError } from './llmCall.js';
import { assessPageHealth, detectionCountWarning, type PageHealth } from './pageHealth.js';
import type { DetectedTech } from './customDetectors.js';
import type { ScrapedData } from './scraper.js';
import { getPool } from '../db/index.js';
import { saveAnalysis } from '../db/analyses.js';
import type { AnalysisResult, ScanWarning } from '../types/analysis.js';

/** Wartezeit vor dem automatischen Re-Scan einer Fehler-/Leerseite (per Env abschaltbar mit 0). */
const RESCAN_DELAY_MS = Number.parseInt(process.env.SCAN_RETRY_DELAY_MS ?? '4000', 10);

/**
 * Teilergebnis, wenn die KI endgültig ausfällt: Erkennungen bleiben erhalten, nach
 * Kategorie gruppiert, ohne KI-Text. Besser als ein kompletter Analyseausfall.
 */
export function buildDetectionOnlyResult(detected: DetectedTech[]): AIAnalysisResult {
  const byCategory = new Map<string, string[]>();
  for (const d of detected) {
    const label = d.version ? `${d.name} ${d.version}` : d.name;
    const category = d.categories?.[0] || 'Other';
    const list = byCategory.get(category) ?? [];
    if (!list.includes(label)) list.push(label);
    byCategory.set(category, list);
  }
  return {
    summary:
      `AI summary unavailable – showing ${detected.length} detected technolog${detected.length === 1 ? 'y' : 'ies'} only. ` +
      'Re-run the analysis to get the AI assessment.',
    categories: [...byCategory.entries()].map(([category, names]) => ({
      category,
      currentTechnology: names.join(', '),
      challengesAndPainPoints: '—',
      adobeOpportunity: '—',
    })),
  };
}

function aiUnavailableWarning(err: unknown): ScanWarning {
  const reason = err instanceof LlmError ? err.message : 'The AI request failed.';
  return {
    code: 'ai_unavailable',
    severity: 'warning',
    message: `${reason} Detected technologies are shown without AI summary and Adobe opportunities – re-run the analysis to complete them.`,
  };
}

/** Scrape mit Health-Check; bei Fehlerseite/5xx/Leerseite genau ein automatischer Re-Scan. */
async function scrapeWithHealthCheck(
  url: string,
  onProgress: (msg: string) => void,
): Promise<{ scraped: ScrapedData; health: PageHealth }> {
  const scraped = await scrapePage(url, onProgress);
  const health = assessPageHealth(scraped);
  if (!health.retryable || RESCAN_DELAY_MS < 0) return { scraped, health };

  onProgress('The page looked like an error or empty page – retrying the scan once…');
  await new Promise((resolve) => setTimeout(resolve, RESCAN_DELAY_MS));
  try {
    const retry = await scrapePage(url, onProgress);
    const retryHealth = assessPageHealth(retry);
    const better =
      (!retryHealth.retryable && health.retryable) || retryHealth.contentScore > health.contentScore * 1.2;
    return better ? { scraped: retry, health: retryHealth } : { scraped, health };
  } catch (err) {
    console.warn('Re-scan failed, keeping first result:', (err as Error).message);
    return { scraped, health };
  }
}

export interface AnalysisWriter {
  sendProgress(phase: string, message: string, data?: Record<string, unknown>): void;
  sendResult(result: AnalysisResult): void;
  sendError(message: string): void;
  close(): void;
}

export async function analyzeUrl(url: string, sse: AnalysisWriter): Promise<void> {
  sse.sendProgress('scraping', `Fetching ${url}…`);

  const { scraped, health } = await scrapeWithHealthCheck(url, (msg) =>
    sse.sendProgress('scraping', msg),
  );
  const scanWarnings: ScanWarning[] = [...health.warnings];
  sse.sendProgress('scraping', `Page loaded: "${scraped.title}"`, {
    title: scraped.title,
    finalUrl: scraped.finalUrl,
  });

  // Phase 2: Detect technologies
  sse.sendProgress('detecting', 'Scanning for known technologies…');

  let detected = await detectTechnologies(scraped, (msg) =>
    sse.sendProgress('detecting', msg),
  );
  sse.sendProgress(
    'detecting',
    `Found ${detected.length} technologies`,
    { technologies: detected.map((t) => t.name) },
  );

  // Phase 2b: repräsentative Unterseiten mitscannen (best-effort, beschränkt).
  // Abschaltbar via MULTI_PAGE_CRAWL=0; ein Fehler bricht die Analyse nie.
  if (process.env.MULTI_PAGE_CRAWL !== '0') {
    try {
      const { detected: enriched, pagesCrawled } = await enrichWithAdditionalPages(
        scraped,
        detected,
        (msg) => sse.sendProgress('detecting', msg),
      );
      detected = enriched;
      if (pagesCrawled.length > 0) {
        sse.sendProgress(
          'detecting',
          `Enriched stack across ${pagesCrawled.length} additional page(s) — ${detected.length} technologies total`,
          { technologies: detected.map((t) => t.name) },
        );
      }
    } catch (err) {
      console.error('Multi-page enrichment failed (continuing with single page):', err);
    }
  }

  // Phase 3: AI Analysis
  sse.sendProgress('analyzing', 'Claude is analyzing the technology stack…');

  // Starke Detektionen sind autoritativ; schwache (nur ein generisches HTML-Signal)
  // gehen als unverifizierte Hinweise ins Modell, damit sie nicht als Fakt gelten.
  const strongDetections = detected.filter((d) => !d.weak);
  const weakDetections = detected.filter((d) => d.weak);

  const fewWarning = detectionCountWarning(strongDetections.length);
  if (fewWarning) scanWarnings.push(fewWarning);

  let chunkCount = 0;
  let aiResult: AIAnalysisResult;
  try {
    aiResult = await analyzeWithAI(
      scraped,
      strongDetections,
      () => {
        chunkCount++;
        if (chunkCount % 15 === 0) {
          const msgs = [
            'Generating summary…',
            'Identifying opportunities…',
            'Structuring results…',
            'Almost done…',
          ];
          const idx = Math.min(
            Math.floor(chunkCount / 15) % msgs.length,
            msgs.length - 1,
          );
          sse.sendProgress('analyzing', msgs[idx]);
        }
      },
      weakDetections,
    );
  } catch (err) {
    // KI endgültig ausgefallen (nach Retries): Teilergebnis statt Totalausfall.
    console.error('AI analysis failed – returning detection-only result:', (err as Error).message);
    sse.sendProgress('analyzing', 'AI analysis unavailable – returning detected technologies only');
    aiResult = buildDetectionOnlyResult(detected);
    scanWarnings.push(aiUnavailableWarning(err));
  }

  // Phase 4: Compile and send results
  const result: AnalysisResult = {
    // Eingegebene URL bleibt primär (User-Intent); die tatsächlich geladene URL
    // nach Redirects nur als Zusatzinfo, falls abweichend.
    url,
    finalUrl: scraped.finalUrl !== url ? scraped.finalUrl : undefined,
    analyzedAt: new Date().toISOString(),
    summary: aiResult.summary,
    categories: aiResult.categories,
    rawDetections: detected.map((d) => ({
      name: d.name,
      categories: d.categories,
      confidence: d.confidence,
      version: d.version,
      weak: d.weak,
      ...(d.evidence?.length ? { evidence: d.evidence } : {}),
    })),
    pageContentExcerpt: scraped.bodyText
      ? scraped.bodyText.substring(0, 12000)
      : undefined,
    ...(scanWarnings.length ? { scanWarnings } : {}),
  };

  sse.sendProgress('complete', 'Analysis complete!');

  const pool = getPool();
  if (pool) {
    try {
      const id = await saveAnalysis(pool, result);
      if (id) result.id = id;
    } catch (err) {
      console.error('Failed to save analysis to DB:', err);
    }
  }

  sse.sendResult(result);
}

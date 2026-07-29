import { scrapePage } from './scraper.js';
import { detectTechnologies } from './detector.js';
import { analyzeWithAI } from './ai.js';
import { getPool } from '../db/index.js';
import { saveAnalysis } from '../db/analyses.js';
import type { AnalysisResult } from '../types/analysis.js';

export interface AnalysisWriter {
  sendProgress(phase: string, message: string, data?: Record<string, unknown>): void;
  sendResult(result: AnalysisResult): void;
  sendError(message: string): void;
  close(): void;
}

export async function analyzeUrl(url: string, sse: AnalysisWriter): Promise<void> {
  sse.sendProgress('scraping', `Fetching ${url}…`);

  const scraped = await scrapePage(url, (msg) =>
    sse.sendProgress('scraping', msg),
  );
  sse.sendProgress('scraping', `Page loaded: "${scraped.title}"`, {
    title: scraped.title,
    finalUrl: scraped.finalUrl,
  });

  // Phase 2: Detect technologies
  sse.sendProgress('detecting', 'Scanning for known technologies…');

  const detected = await detectTechnologies(scraped, (msg) =>
    sse.sendProgress('detecting', msg),
  );
  sse.sendProgress(
    'detecting',
    `Found ${detected.length} technologies`,
    { technologies: detected.map((t) => t.name) },
  );

  // Phase 3: AI Analysis
  sse.sendProgress('analyzing', 'Claude is analyzing the technology stack…');

  // Starke Detektionen sind autoritativ; schwache (nur ein generisches HTML-Signal)
  // gehen als unverifizierte Hinweise ins Modell, damit sie nicht als Fakt gelten.
  const strongDetections = detected.filter((d) => !d.weak);
  const weakDetections = detected.filter((d) => d.weak);

  let chunkCount = 0;
  const aiResult = await analyzeWithAI(
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
    })),
    pageContentExcerpt: scraped.bodyText
      ? scraped.bodyText.substring(0, 12000)
      : undefined,
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

import { SSEWriter } from '../utils/sse.js';
import { scrapePage } from './scraper.js';
import { detectTechnologies } from './detector.js';
import { analyzeWithAI } from './ai.js';
import { getPool } from '../db/index.js';
import { saveAnalysis } from '../db/analyses.js';
import type { AnalysisResult } from '../types/analysis.js';

export async function analyzeUrl(url: string, sse: SSEWriter): Promise<void> {
  // Phase 1: Scrape
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

  let chunkCount = 0;
  const aiResult = await analyzeWithAI(scraped, detected, () => {
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
  });

  // Phase 4: Compile and send results
  const result: AnalysisResult = {
    url: scraped.finalUrl,
    analyzedAt: new Date().toISOString(),
    summary: aiResult.summary,
    categories: aiResult.categories,
    rawDetections: detected.map((d) => ({
      name: d.name,
      categories: d.categories,
      confidence: d.confidence,
      version: d.version,
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

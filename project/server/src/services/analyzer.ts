import { SSEWriter } from '../utils/sse.js';
import { scrapePage } from './scraper.js';
import { detectTechnologies } from './detector.js';
import { analyzeWithAI } from './ai.js';
import type { AnalysisResult } from '../types/analysis.js';

export async function analyzeUrl(url: string, sse: SSEWriter): Promise<void> {
  // Phase 1: Scrape
  sse.sendProgress('scraping', `Fetching ${url}...`);

  const scraped = await scrapePage(url);
  sse.sendProgress('scraping', `Page loaded: "${scraped.title}"`, {
    title: scraped.title,
    finalUrl: scraped.finalUrl,
  });

  // Phase 2: Detect technologies
  sse.sendProgress('detecting', 'Running technology detection...');

  const detected = await detectTechnologies(scraped);
  sse.sendProgress(
    'detecting',
    `Found ${detected.length} technologies`,
    { technologies: detected.map((t) => t.name) },
  );

  // Phase 3: AI Analysis
  sse.sendProgress('analyzing', 'Analyzing technology stack with AI...');

  let chunkCount = 0;
  const aiResult = await analyzeWithAI(scraped, detected, () => {
    chunkCount++;
    if (chunkCount % 20 === 0) {
      sse.sendProgress('analyzing', 'AI generating analysis...');
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
  };

  sse.sendProgress('complete', 'Analysis complete!');
  sse.sendResult(result);
}

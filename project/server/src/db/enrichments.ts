import type { AnalysisEnrichments } from '../types/parity.js';
import type { AnalysisResult } from '../types/analysis.js';
import type { DbHandle } from './types.js';
import { getAnalysisById, updateAnalysis } from './analyses.js';

const locks = new Map<number, Promise<unknown>>();

/**
 * Serialisiert Read-Modify-Writes auf result_json pro Analyse, damit parallele
 * Hintergrund-Jobs (Traffic, ObservePoint, GEO, Use Cases) sich nicht gegenseitig überschreiben.
 */
export async function withAnalysisWriteLock<T>(analysisId: number, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(analysisId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  locks.set(analysisId, next);
  try {
    return await next;
  } finally {
    if (locks.get(analysisId) === next) locks.delete(analysisId);
  }
}

/** Merged einen einzelnen Enrichment-Eintrag in result_json, ohne andere Felder zu berühren. */
export async function saveEnrichment<K extends keyof AnalysisEnrichments>(
  db: DbHandle,
  analysisId: number,
  key: K,
  value: AnalysisEnrichments[K],
): Promise<boolean> {
  return withAnalysisWriteLock(analysisId, async () => {
    const current = await getAnalysisById(db, analysisId);
    if (!current) return false;
    return updateAnalysis(db, analysisId, { enrichments: { ...(current.enrichments ?? {}), [key]: value } });
  });
}

/** Speichert Use-Case-Ergebnis (+ Sitemap) unter demselben Lock wie die Enrichments. */
export async function saveUseCaseDiscovery(
  db: DbHandle,
  analysisId: number,
  updates: Pick<AnalysisResult, 'useCaseDiscovery' | 'sitemapUrls'>,
): Promise<boolean> {
  return withAnalysisWriteLock(analysisId, () => updateAnalysis(db, analysisId, updates));
}

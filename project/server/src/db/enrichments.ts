import type { AnalysisEnrichments } from '../types/parity.js';
import type { DbHandle } from './types.js';
import { getAnalysisById, updateAnalysis } from './analyses.js';

/** Merged einen einzelnen Enrichment-Eintrag in result_json, ohne andere Felder zu berühren. */
export async function saveEnrichment<K extends keyof AnalysisEnrichments>(
  db: DbHandle,
  analysisId: number,
  key: K,
  value: AnalysisEnrichments[K],
): Promise<boolean> {
  const current = await getAnalysisById(db, analysisId);
  if (!current) return false;
  return updateAnalysis(db, analysisId, { enrichments: { ...(current.enrichments ?? {}), [key]: value } });
}

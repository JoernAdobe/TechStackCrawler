import { getAnalysisById } from '../db/analyses.js';
import { saveEnrichment } from '../db/enrichments.js';
import { clearAutoJob, listAutoJobs, markAutoJob } from '../db/resumeStore.js';
import type { DbHandle } from '../db/types.js';
import type { GeoScoreResult } from '../types/parity.js';
import { runGeoScore, type GeoScoreOptions } from './geoScore.js';

/**
 * GEO-Score-Läufe im Hintergrund – automatisch nach jeder Einzelanalyse (Auto-Detect für Marke,
 * Konkurrenten, Land) und manuell mit eigenen Parametern. Jeder Lauf wird in `auto_jobs` vorgemerkt
 * und nach einem Server-Neustart fortgesetzt; das Ergebnis landet sofort in der DB. Der Client pollt
 * den Status und holt das Ergebnis auch nach einem Verbindungsabbruch ab.
 */

export type AutoGeoStatus = 'running' | 'failed' | 'idle';

const KIND = 'geo';
const RESUME_MAX_AGE_MS = 6 * 3600_000;
const MAX_CONCURRENT = Math.max(1, Number(process.env.AUTO_GEO_CONCURRENCY) || 2);
const running = new Map<number, Promise<GeoScoreResult | null>>();
const failures = new Map<number, string>();
const waiting: Array<() => void> = [];
let active = 0;

interface GeoJobPayload {
  /** true = manueller Lauf: vorhandenen GEO Score überschreiben. */
  force?: boolean;
  options?: GeoScoreOptions;
}

export function autoGeoEnabled(): boolean {
  return process.env.AUTO_GEO !== 'false';
}

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) next();
  else active--;
}

function launch(db: DbHandle, analysisId: number, payload: GeoJobPayload, persist: boolean): Promise<GeoScoreResult | null> {
  failures.delete(analysisId);
  const job = (async (): Promise<GeoScoreResult | null> => {
    if (persist) await markAutoJob(db, analysisId, KIND, payload).catch(() => undefined);
    await acquire();
    try {
      const analysis = await getAnalysisById(db, analysisId);
      if (!analysis || (!payload.force && analysis.enrichments?.geo)) return analysis?.enrichments?.geo ?? null;
      const result = await runGeoScore(analysis, payload.options ?? {});
      await saveEnrichment(db, analysisId, 'geo', result);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.set(analysisId, msg);
      console.warn(`[geo] analysis ${analysisId} failed:`, msg);
      throw err;
    } finally {
      release();
      await clearAutoJob(db, analysisId, KIND).catch(() => undefined);
    }
  })();
  running.set(analysisId, job);
  const cleanup = () => {
    if (running.get(analysisId) === job) running.delete(analysisId);
  };
  job.then(cleanup, cleanup);
  return job;
}

/** Automatischer Lauf nach einer Analyse (überspringt, wenn schon ein GEO Score existiert). */
export function startAutoGeo(db: DbHandle, analysisId: number): void {
  if (!autoGeoEnabled() || running.has(analysisId)) return;
  launch(db, analysisId, {}, true).catch(() => undefined);
}

/**
 * Manueller Lauf mit eigenen Parametern. Läuft serverseitig weiter, auch wenn der Client die
 * Verbindung verliert; ein laufender Job derselben Analyse wird vorher abgewartet.
 */
export async function runTrackedGeo(db: DbHandle, analysisId: number, options: GeoScoreOptions): Promise<GeoScoreResult> {
  const prev = running.get(analysisId);
  if (prev) await prev.catch(() => undefined);
  const result = await launch(db, analysisId, { force: true, options }, true);
  if (!result) throw new Error('Analysis not found');
  return result;
}

export function autoGeoStatus(analysisId: number): { status: AutoGeoStatus; error?: string } {
  if (running.has(analysisId)) return { status: 'running' };
  const error = failures.get(analysisId);
  return error ? { status: 'failed', error } : { status: 'idle' };
}

/** Wartet (begrenzt) auf einen laufenden GEO-Job, z. B. damit das Pre-Briefing den GEO Score nutzen kann. */
export async function awaitAutoGeo(analysisId: number, timeoutMs: number): Promise<void> {
  const job = running.get(analysisId);
  if (!job) return;
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([job.catch(() => undefined), new Promise<void>((r) => { timer = setTimeout(r, timeoutMs); })]);
  clearTimeout(timer);
}

/** Nach einem Neustart: vorgemerkte GEO-Läufe fortsetzen. */
export async function resumeGeoJobs(db: DbHandle): Promise<number> {
  const jobs = await listAutoJobs(db, KIND, RESUME_MAX_AGE_MS);
  for (const j of jobs) {
    if (running.has(j.analysisId)) continue;
    launch(db, j.analysisId, (j.payload as GeoJobPayload) ?? {}, false).catch(() => undefined);
  }
  return jobs.length;
}

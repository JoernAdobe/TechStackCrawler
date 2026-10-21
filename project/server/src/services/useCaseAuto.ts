import { getAnalysisById } from '../db/analyses.js';
import { getLatestDoneBriefingResult } from '../db/briefingJobs.js';
import { saveUseCaseDiscovery } from '../db/enrichments.js';
import { clearAutoJob, listAutoJobs, markAutoJob } from '../db/resumeStore.js';
import type { DbHandle } from '../db/types.js';
import type { UseCaseDiscoveryResult } from '../types/analysis.js';
import { awaitAutoGeo } from './geoAuto.js';
import { discoverUseCases } from './useCaseDiscovery.js';

/**
 * Use-Case-Discovery mit allen verfügbaren Daten (Tech Stack, Traffic, Lighthouse, GEO, Apps,
 * ObservePoint und – sobald fertig – Client-Pre-Briefing-Insights).
 *
 * - 'analysis': nach jeder Einzelanalyse (wartet kurz auf Auto-GEO), nur wenn noch nichts da ist.
 * - 'briefing': nach einem fertigen Pre-Briefing, nur wenn die Briefing-Insights noch fehlen.
 * - 'manual':   Nutzer startet neu (überschreibt immer).
 * Jeder Lauf ist in `auto_jobs` vorgemerkt und wird nach einem Neustart fortgesetzt; das Ergebnis
 * wird sofort gespeichert, der Client pollt den Status (auch nach Verbindungsabbruch).
 */

export type AutoUseCaseStatus = 'running' | 'failed' | 'idle';
export type AutoUseCaseReason = 'analysis' | 'briefing' | 'manual';

const KIND = 'use-cases';
const RESUME_MAX_AGE_MS = 6 * 3600_000;
const MAX_CONCURRENT = Math.max(1, Number(process.env.AUTO_USE_CASES_CONCURRENCY) || 2);
const GEO_WAIT_MS = Math.max(0, Number(process.env.USE_CASES_GEO_WAIT_MS) || 150_000);
const running = new Map<number, Promise<UseCaseDiscoveryResult | null>>();
const rerunRequested = new Map<number, AutoUseCaseReason>();
const failures = new Map<number, string>();
const waiting: Array<() => void> = [];
let active = 0;

export function autoUseCasesEnabled(): boolean {
  return process.env.AUTO_USE_CASES !== 'false';
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

async function runOnce(db: DbHandle, analysisId: number, reason: AutoUseCaseReason): Promise<UseCaseDiscoveryResult | null> {
  if (reason === 'analysis') await awaitAutoGeo(analysisId, GEO_WAIT_MS);
  await acquire();
  try {
    const analysis = await getAnalysisById(db, analysisId);
    if (!analysis) return null;
    const briefing = await getLatestDoneBriefingResult(db, analysisId);
    const existing = analysis.useCaseDiscovery;
    if (reason === 'analysis' && existing) return existing;
    if (reason === 'briefing' && (!briefing || existing?.basedOn?.includes('Client Pre-Briefing'))) return existing ?? null;
    const { result, sitemapUrls } = await discoverUseCases(analysis, { briefing });
    await saveUseCaseDiscovery(db, analysisId, { useCaseDiscovery: result, sitemapUrls });
    return result;
  } finally {
    release();
  }
}

/** Stärkerer Grund gewinnt, falls während eines Laufs mehrere Nachläufe angefordert werden. */
function mergeReason(a: AutoUseCaseReason | undefined, b: AutoUseCaseReason): AutoUseCaseReason {
  return a === 'manual' || b === 'manual' ? 'manual' : b;
}

function launch(db: DbHandle, analysisId: number, reason: AutoUseCaseReason): Promise<UseCaseDiscoveryResult | null> {
  failures.delete(analysisId);
  const job = (async (): Promise<UseCaseDiscoveryResult | null> => {
    let current: AutoUseCaseReason = reason;
    let last: UseCaseDiscoveryResult | null = null;
    for (;;) {
      await markAutoJob(db, analysisId, KIND, { reason: current }).catch(() => undefined);
      try {
        last = await runOnce(db, analysisId, current);
        failures.delete(analysisId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.set(analysisId, msg);
        console.warn(`[use-cases] analysis ${analysisId} (${current}) failed:`, msg);
        if (!rerunRequested.has(analysisId)) {
          await clearAutoJob(db, analysisId, KIND).catch(() => undefined);
          throw err;
        }
      }
      const next = rerunRequested.get(analysisId);
      rerunRequested.delete(analysisId);
      if (!next) break;
      current = next;
    }
    await clearAutoJob(db, analysisId, KIND).catch(() => undefined);
    return last;
  })();
  running.set(analysisId, job);
  const cleanup = () => {
    if (running.get(analysisId) === job) running.delete(analysisId);
  };
  job.then(cleanup, cleanup);
  return job;
}

export function startAutoUseCases(db: DbHandle, analysisId: number, reason: AutoUseCaseReason): void {
  if (reason !== 'manual' && !autoUseCasesEnabled()) return;
  if (running.has(analysisId)) {
    // Läuft schon (z. B. Erstlauf) → danach mit Briefing bzw. manuell neu rechnen.
    if (reason !== 'analysis') rerunRequested.set(analysisId, mergeReason(rerunRequested.get(analysisId), reason));
    return;
  }
  launch(db, analysisId, reason).catch(() => undefined);
}

/** Manueller Lauf (Button): läuft serverseitig weiter, auch wenn der Client die Verbindung verliert. */
export async function runTrackedUseCases(db: DbHandle, analysisId: number): Promise<UseCaseDiscoveryResult> {
  const prev = running.get(analysisId);
  if (prev) await prev.catch(() => undefined);
  const result = await launch(db, analysisId, 'manual');
  if (!result) throw new Error('Analysis not found');
  return result;
}

export function autoUseCasesStatus(analysisId: number): { status: AutoUseCaseStatus; error?: string } {
  if (running.has(analysisId)) return { status: 'running' };
  const error = failures.get(analysisId);
  return error ? { status: 'failed', error } : { status: 'idle' };
}

/** Nach einem Neustart: vorgemerkte Use-Case-Läufe fortsetzen. */
export async function resumeUseCaseJobs(db: DbHandle): Promise<number> {
  const jobs = await listAutoJobs(db, KIND, RESUME_MAX_AGE_MS);
  for (const j of jobs) {
    if (running.has(j.analysisId)) continue;
    const reason = (j.payload as { reason?: AutoUseCaseReason } | undefined)?.reason ?? 'analysis';
    launch(db, j.analysisId, reason).catch(() => undefined);
  }
  return jobs.length;
}

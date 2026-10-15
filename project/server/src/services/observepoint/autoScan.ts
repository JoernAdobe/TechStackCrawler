import { config } from '../../config.js';
import { getAnalysisById, listAnalyses } from '../../db/analyses.js';
import { saveEnrichment } from '../../db/enrichments.js';
import type { DbHandle } from '../../db/types.js';
import type { ObservePointResult } from '../../types/parity.js';
import { buildEvidenceMatrix, observePointCoverage } from '../evidenceMatrix.js';
import { normalizeDomain } from '../traffic.js';
import { getAudit, getTagLibrary, isObservePointConfigured, listRuns, type OpRun } from './client.js';
import { getObservePoint, resultFromRun, startFreshScan } from './index.js';

/**
 * Automatischer ObservePoint-Abgleich im Hintergrund:
 * 1. Nach jeder Analyse bestehende Audits suchen (reuse) und Evidence Matrix speichern.
 * 2. Gibt es kein Audit, einen Fresh-Scan über das Scratch-Audit in eine serielle Queue stellen
 *    (ein Scratch-Audit = immer nur ein Scan gleichzeitig), den eigenen Run pollen und das Ergebnis
 *    automatisch in alle wartenden Analysen schreiben.
 * Offene Jobs werden nach einem Neustart aus der DB wieder aufgenommen (resumeAutoScans).
 */

interface Job {
  url: string;
  domain: string;
  analysisIds: Set<number>;
  runId?: number;
  startedAt?: number;
}

export interface AutoScanDeps {
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  pollMs: number;
  busyWaitMs: number;
  maxRunMs: number;
  maxBusyMs: number;
}

const MAX_QUEUE = 25;
const MIN = 60_000;
const defaults: AutoScanDeps = {
  sleep: (ms) => new Promise((r) => setTimeout(r, ms).unref?.()),
  now: () => Date.now(),
  pollMs: MIN,
  busyWaitMs: 2 * MIN,
  maxRunMs: 90 * MIN,
  maxBusyMs: 60 * MIN,
};

let deps: AutoScanDeps = defaults;
let db: DbHandle | null = null;
const queue: Job[] = [];
let working = false;

/** Nur für Tests: Timer/Zeit injizieren und Queue leeren. */
export function __setAutoScanDeps(next: Partial<AutoScanDeps> | null): void {
  deps = next ? { ...defaults, ...next } : defaults;
  queue.length = 0;
  working = false;
}

export function autoFreshEnabled(): boolean {
  const { allowCreate, scratchAuditId } = config.observepoint;
  return isObservePointConfigured() && allowCreate && scratchAuditId > 0;
}

export function autoScanQueueSize(): number {
  return queue.length;
}

/** OP-Ergebnis speichern und Evidence Matrix aus den Detections der Analyse neu bauen. */
export async function saveObservePointResult(handle: DbHandle, analysisId: number, observepoint: ObservePointResult) {
  const analysis = await getAnalysisById(handle, analysisId);
  if (!analysis) return null;
  const library = await getTagLibrary();
  const evidenceMatrix = buildEvidenceMatrix({
    detections: analysis.rawDetections ?? [],
    observepoint,
    opCoverage: observePointCoverage(library),
  });
  const saved =
    (await saveEnrichment(handle, analysisId, 'observepoint', observepoint)) &&
    (await saveEnrichment(handle, analysisId, 'evidenceMatrix', evidenceMatrix));
  return saved ? { observepoint, evidenceMatrix } : null;
}

function pending(url: string, domain: string, note: string, runId?: number): ObservePointResult {
  return { url, domain, fetchedAt: new Date().toISOString(), status: 'running', reused: false, auto: true, tags: [], note, ...(runId ? { runId } : {}) };
}

async function saveAll(job: Job, result: ObservePointResult): Promise<void> {
  if (!db) return;
  for (const id of job.analysisIds) {
    try {
      await saveObservePointResult(db, id, result);
    } catch (err) {
      console.warn(`[op-auto] save for analysis ${id} failed:`, err instanceof Error ? err.message : err);
    }
  }
}

/** Fresh-Scan in die Queue stellen (gleiche Domain → Analyse an bestehenden Job hängen). */
export async function enqueueFreshScan(handle: DbHandle, analysisId: number, url: string): Promise<ObservePointResult> {
  db = handle;
  const domain = normalizeDomain(url);
  const existing = queue.find((j) => j.domain === domain);
  let result: ObservePointResult;
  if (existing) {
    existing.analysisIds.add(analysisId);
    result = pending(url, domain, existing.runId ? scanningNote() : queuedNote(queue.indexOf(existing)), existing.runId);
  } else if (queue.length >= MAX_QUEUE) {
    result = { ...pending(url, domain, 'ObservePoint scan queue is full – please try again later.'), status: 'not_found' };
  } else {
    queue.push({ url, domain, analysisIds: new Set([analysisId]) });
    result = pending(url, domain, queuedNote(queue.length - 1));
  }
  await saveObservePointResult(handle, analysisId, result);
  void work();
  return result;
}

const scanningNote = () =>
  `ObservePoint scan running (max. ${config.observepoint.maxPages} pages) – results appear here automatically.`;
const queuedNote = (pos: number) =>
  pos <= 0
    ? 'No ObservePoint audit found – a fresh scan is starting automatically.'
    : `No ObservePoint audit found – fresh scan queued (position ${pos + 1}); results appear here automatically.`;

/**
 * Auto-Abgleich nach einer Analyse: reuse; wenn kein Audit existiert und Fresh-Scans erlaubt sind → Queue.
 * Fehler werden nur geloggt – die Analyse selbst darf daran nie scheitern.
 */
export async function autoObservePoint(handle: DbHandle, analysisId: number, url: string): Promise<void> {
  if (!isObservePointConfigured()) return;
  db = handle;
  try {
    const op = await getObservePoint(url, 'reuse');
    if (op.status === 'not_found' && autoFreshEnabled()) {
      await enqueueFreshScan(handle, analysisId, url);
      return;
    }
    await saveObservePointResult(handle, analysisId, { ...op, auto: true });
  } catch (err) {
    console.warn(`[op-auto] analysis ${analysisId}:`, err instanceof Error ? err.message : err);
  }
}

async function work(): Promise<void> {
  if (working) return;
  working = true;
  try {
    while (queue.length) {
      const job = queue[0]!;
      try {
        await processJob(job);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[op-auto] scan for ${job.domain} failed:`, msg);
        await saveAll(job, { ...pending(job.url, job.domain, `Automatic ObservePoint scan failed: ${msg}`), status: 'not_found' });
      }
      queue.shift();
      // Wartende Jobs über ihre neue Position informieren.
      for (const [i, j] of queue.entries()) if (!j.runId) await saveAll(j, pending(j.url, j.domain, queuedNote(i)));
    }
  } finally {
    working = false;
  }
}

async function startWhenFree(job: Job): Promise<void> {
  const scratchId = config.observepoint.scratchAuditId;
  const waitUntil = deps.now() + deps.maxBusyMs;
  for (;;) {
    const audit = await getAudit(scratchId);
    if (!audit.webAuditRunning) break;
    if (deps.now() > waitUntil) throw new Error('scratch audit stayed busy for too long');
    await deps.sleep(deps.busyWaitMs);
  }
  job.startedAt = deps.now();
  const started = await startFreshScan(job.url, job.domain);
  if (started.status !== 'running') throw new Error(started.note ?? 'scan could not be started');
  job.runId = started.runId ?? (await newestRun(scratchId))?.id;
  await saveAll(job, pending(job.url, job.domain, scanningNote(), job.runId));
}

async function newestRun(auditId: number): Promise<OpRun | undefined> {
  const runs = await listRuns(auditId);
  return runs.slice().sort((a, b) => b.id - a.id)[0];
}

async function processJob(job: Job): Promise<void> {
  const scratchId = config.observepoint.scratchAuditId;
  if (!job.runId) await startWhenFree(job);
  const deadline = (job.startedAt ?? deps.now()) + deps.maxRunMs;
  for (;;) {
    await deps.sleep(deps.pollMs);
    const runs = await listRuns(scratchId);
    const run = job.runId ? runs.find((r) => r.id === job.runId) : runs.slice().sort((a, b) => b.id - a.id)[0];
    if (run?.completed) {
      const audit = await getAudit(scratchId);
      const result = await resultFromRun(job.url, job.domain, { auditId: scratchId, auditName: audit.name }, run, false);
      await saveAll(job, { ...result, auto: true, note: 'Fresh scan started automatically (no existing audit).' });
      return;
    }
    if (deps.now() > deadline) throw new Error('scan did not finish in time');
  }
}

/** Nach einem Neustart: Analysen mit offenem Auto-Scan wieder in die Queue holen. */
export async function resumeAutoScans(handle: DbHandle): Promise<number> {
  if (!autoFreshEnabled()) return 0;
  db = handle;
  const rows = await listAnalyses(handle, 100);
  let resumed = 0;
  for (const row of rows) {
    const json = typeof row.result_json === 'string' ? row.result_json : JSON.stringify(row.result_json);
    if (!json.includes('"auto":true')) continue;
    let op: ObservePointResult | undefined;
    try {
      op = JSON.parse(json)?.enrichments?.observepoint;
    } catch {
      continue;
    }
    if (!op?.auto || op.status !== 'running') continue;
    const domain = normalizeDomain(op.url);
    const job = queue.find((j) => j.domain === domain);
    if (job) job.analysisIds.add(row.id);
    else queue.push({ url: op.url, domain, analysisIds: new Set([row.id]), ...(op.runId ? { runId: op.runId, startedAt: deps.now() } : {}) });
    resumed++;
  }
  // Bereits laufende Runs zuerst weiterpollen.
  queue.sort((a, b) => Number(!!b.runId) - Number(!!a.runId));
  if (resumed) {
    console.log(`[op-auto] resumed ${resumed} pending ObservePoint scan(s)`);
    void work();
  }
  return resumed;
}

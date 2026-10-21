/**
 * Client Pre-Briefing – powered by Chris Whitehead.
 * Persistente Job-Queue (Tabelle briefing_jobs), standardmäßig max. 2 Jobs parallel
 * (BRIEFING_CONCURRENCY). Zustand liegt in der DB, damit ein Neustart fortsetzen kann.
 *
 * VERTRAG (Signaturen nicht ändern): genutzt von Routes, Batch-Runner und MCP.
 */
import { awaitPendingTraffic } from '../pendingTraffic.js';
import { getPool } from '../../db/index.js';
import { getAnalysisById } from '../../db/analyses.js';
import { awaitAutoGeo } from '../geoAuto.js';
import { startAutoUseCases } from '../useCaseAuto.js';

const GEO_WAIT_MS = Number(process.env.BRIEFING_GEO_WAIT_MS ?? 180_000);
import { saveEnrichment } from '../../db/enrichments.js';
import { clearBriefingCheckpoints, loadBriefingCheckpoints, saveBriefingCheckpoint } from '../../db/resumeStore.js';
import {
  cancelQueuedBriefingJob,
  claimNextBriefingJob,
  findOpenBriefingJob,
  finishBriefingJob,
  getBriefingJob,
  getBriefingJobHtml,
  getBriefingJobWithResult,
  getLatestBriefingJobId,
  insertBriefingJob,
  markRunningBriefingCancelled,
  requeueRunningBriefingJobs,
  updateBriefingProgress,
} from '../../db/briefingJobs.js';
import type { DbHandle } from '../../db/types.js';
import { BadRequestError, DbUnavailableError, NotFoundError } from '../../utils/http.js';
import { LlmError } from '../llmCall.js';
import {
  BRIEFING_LOCKED_SECTION,
  BRIEFING_SECTION_IDS,
  type BriefingJob,
  type BriefingProgress,
  type BriefingResult,
  type BriefingSectionId,
  type BriefingStateResponse,
  type BriefingSummary,
} from '../../types/briefing.js';
import { runBriefingPipeline, type BriefingPipelineInput, type BriefingPipelineOutput } from './pipeline.js';
import { renderBriefingHtml } from './render.js';
import { validateBriefingHtml } from './validate.js';

export interface EnqueueBriefingInput {
  analysisId: number;
  sections: BriefingSectionId[];
  createdBy?: string;
  batchId?: number;
}

// ── Konfiguration / Test-Hooks ─────────────────────────────────────────────

interface WorkerDeps {
  runPipeline: (input: BriefingPipelineInput) => Promise<BriefingPipelineOutput>;
  validate: typeof validateBriefingHtml;
  render: typeof renderBriefingHtml;
}

const defaultDeps: WorkerDeps = {
  runPipeline: runBriefingPipeline,
  validate: validateBriefingHtml,
  render: renderBriefingHtml,
};
let deps: WorkerDeps = { ...defaultDeps };

/** Für Tests: Pipeline/Validator/Renderer ersetzen (ohne Argument → Defaults). */
export function setBriefingWorkerDeps(override: Partial<WorkerDeps> = {}): void {
  deps = { ...defaultDeps, ...override };
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

const concurrency = () => envInt('BRIEFING_CONCURRENCY', 2, 1, 8);
const pollMs = () => envInt('BRIEFING_POLL_MS', 10_000, 200, 600_000);
const jobTimeoutMs = () => envInt('BRIEFING_JOB_TIMEOUT_MS', 30 * 60_000, 1_000, 6 * 3600_000);
const PROGRESS_THROTTLE_MS = 1_000;
const TIMEOUT_REASON = 'briefing-timeout';

// ── Normalisierung / Hilfen ────────────────────────────────────────────────

/** Dedupe, kanonische Reihenfolge, s14 immer dabei; unbekannte IDs → 400. */
export function normalizeBriefingSections(sections: readonly string[]): BriefingSectionId[] {
  const wanted = new Set(sections.map((s) => String(s).trim().toLowerCase()));
  const unknown = [...wanted].filter((s) => !(BRIEFING_SECTION_IDS as readonly string[]).includes(s));
  if (unknown.length) {
    throw new BadRequestError(`Unknown briefing section(s): ${unknown.slice(0, 5).join(', ')}`, {
      allowed: BRIEFING_SECTION_IDS,
    });
  }
  wanted.add(BRIEFING_LOCKED_SECTION);
  return BRIEFING_SECTION_IDS.filter((id) => wanted.has(id));
}

function initialProgress(sections: BriefingSectionId[]): BriefingProgress[] {
  return [
    ...sections.map((step): BriefingProgress => ({ step, state: 'pending' })),
    { step: 'executive', state: 'pending' },
    { step: 'render', state: 'pending' },
  ];
}

function requireDb(): DbHandle {
  const db = getPool();
  if (!db) throw new DbUnavailableError();
  return db;
}

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

/** Rohfehler können URLs, Pfade oder Keys enthalten → nur kurze, sichere Meldungen speichern. */
export function friendlyBriefingError(err: unknown): string {
  if (err instanceof LlmError) return err.message;
  const raw = err instanceof Error ? err.message : String(err);
  if (raw === TIMEOUT_REASON || /timed? ?out|timeout/i.test(raw)) return 'Briefing generation timed out';
  if (/throttl|rate.?limit|\b429\b/i.test(raw)) return 'AI service is busy – please try again later';
  if (/^Analysis not found$/.test(raw)) return 'Analysis not found';
  return 'Briefing generation failed';
}

async function saveSummary(db: DbHandle, analysisId: number, summary: BriefingSummary): Promise<void> {
  try {
    await saveEnrichment(db, analysisId, 'briefing', summary);
  } catch (err) {
    console.error(`Briefing: saving summary for analysis ${analysisId} failed:`, err instanceof Error ? err.message : err);
  }
}

// ── Worker ────────────────────────────────────────────────────────────────

const running = new Map<number, AbortController>();
const liveProgress = new Map<number, BriefingProgress[]>();
let pollTimer: NodeJS.Timeout | null = null;
let filling = false;
let refill = false;

/** Fortschritt im Speicher halten, DB-Schreibzugriffe auf ≤ 1/s drosseln. */
class ProgressWriter {
  private lastWrite = 0;
  private timer: NodeJS.Timeout | null = null;
  constructor(
    private readonly db: DbHandle,
    private readonly jobId: number,
    readonly progress: BriefingProgress[],
  ) {}

  update(p: BriefingProgress): void {
    const entry: BriefingProgress = { step: p.step, state: p.state, ...(p.message ? { message: p.message.slice(0, 300) } : {}) };
    const i = this.progress.findIndex((e) => e.step === p.step);
    if (i >= 0) this.progress[i] = entry;
    else this.progress.push(entry);
    const wait = this.lastWrite + PROGRESS_THROTTLE_MS - Date.now();
    if (wait <= 0) void this.flush();
    else this.timer ??= setTimeout(() => void this.flush(), wait);
  }

  async flush(): Promise<void> {
    this.stop();
    this.lastWrite = Date.now();
    await updateBriefingProgress(this.db, this.jobId, this.progress).catch((err) =>
      console.error(`Briefing ${this.jobId}: progress write failed:`, err instanceof Error ? err.message : err),
    );
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

function isTimeout(signal: AbortSignal): boolean {
  return signal.aborted && signal.reason instanceof Error && signal.reason.message === TIMEOUT_REASON;
}

async function processJob(db: DbHandle, job: BriefingJob, controller: AbortController): Promise<void> {
  const progress = job.progress.length ? job.progress : initialProgress(job.sections);
  liveProgress.set(job.id, progress);
  const writer = new ProgressWriter(db, job.id, progress);
  const timeout = setTimeout(() => controller.abort(new Error(TIMEOUT_REASON)), jobTimeoutMs());
  const throwIfAborted = () => {
    if (controller.signal.aborted) throw controller.signal.reason ?? new Error('aborted');
  };
  try {
    // Läuft der automatische GEO Score noch, kurz warten, damit er in Briefing und Overall Score einfließt.
    // Ebenso Semrush/Tranco, damit SEO- und Markt-Abschnitte dieselben Zahlen nutzen wie der Analyzer.
    await Promise.all([awaitAutoGeo(job.analysisId, GEO_WAIT_MS), awaitPendingTraffic(job.analysisId, GEO_WAIT_MS)]);
    throwIfAborted();
    const analysis = await getAnalysisById(db, job.analysisId);
    if (!analysis) throw new Error('Analysis not found');
    await saveSummary(db, job.analysisId, { jobId: job.id, status: 'running', overallScore: null });

    // Fertige Abschnitte eines unterbrochenen Laufs wiederverwenden; neue sofort sichern.
    const resumeSections = await loadBriefingCheckpoints(db, job.id).catch(() => []);
    if (resumeSections.length) console.log(`Briefing job ${job.id}: resuming with ${resumeSections.length} saved section(s)`);
    const out = await deps.runPipeline({
      jobId: job.id,
      analysis,
      sections: job.sections,
      signal: controller.signal,
      onProgress: (p) => writer.update(p),
      resumeSections,
      onSectionDone: (section) => saveBriefingCheckpoint(db, job.id, section),
    });
    throwIfAborted();

    writer.update({ step: 'render', state: 'writing' });
    const result: BriefingResult = {
      jobId: job.id,
      analysisId: job.analysisId,
      companyName: out.companyName,
      domain: out.domain,
      clientDomains: out.clientDomains,
      generatedAt: new Date().toISOString(),
      language: 'en',
      sections: out.sections,
      executive: out.executive,
      usage: out.usage,
      validation: { ok: true, errors: [], warnings: [] },
    };
    const html = deps.render(result);
    result.validation = await deps.validate(html, out.sections.map((s) => s.id));
    writer.update({
      step: 'render',
      state: 'done',
      ...(result.validation.ok ? {} : { message: `${result.validation.errors.length} validation issue(s)` }),
    });
    writer.stop();
    throwIfAborted();

    if (!(await finishBriefingJob(db, job.id, { status: 'done', progress, companyName: out.companyName, result, html }))) {
      await saveSummary(db, job.analysisId, { jobId: job.id, status: 'cancelled', overallScore: null });
      return;
    }
    await clearBriefingCheckpoints(db, job.id).catch(() => undefined);
    await saveSummary(db, job.analysisId, {
      jobId: job.id,
      status: 'done',
      overallScore: out.executive.overallScore,
      band: out.executive.band,
      confidence: out.executive.confidence,
      verdict: out.executive.verdict,
      generatedAt: result.generatedAt,
    });
    // Use Cases mit den Briefing-Insights neu rechnen (nur Einzelanalysen; Batches steuern das selbst).
    if (!job.batchId) startAutoUseCases(db, job.analysisId, 'briefing');
  } catch (err) {
    writer.stop();
    if (controller.signal.aborted && !isTimeout(controller.signal)) {
      await markRunningBriefingCancelled(db, job.id);
      await clearBriefingCheckpoints(db, job.id).catch(() => undefined);
      await updateBriefingProgress(db, job.id, progress);
      await saveSummary(db, job.analysisId, { jobId: job.id, status: 'cancelled', overallScore: null });
      return;
    }
    const cause = isTimeout(controller.signal) ? new Error(TIMEOUT_REASON) : err;
    console.error(`Briefing job ${job.id} failed:`, cause instanceof Error ? cause.message : cause);
    await finishBriefingJob(db, job.id, { status: 'error', progress, error: friendlyBriefingError(cause) });
    await clearBriefingCheckpoints(db, job.id).catch(() => undefined);
    await saveSummary(db, job.analysisId, { jobId: job.id, status: 'error', overallScore: null });
  } finally {
    clearTimeout(timeout);
    liveProgress.delete(job.id);
  }
}

async function fill(): Promise<void> {
  if (filling) {
    refill = true;
    return;
  }
  filling = true;
  try {
    do {
      refill = false;
      const db = getPool();
      if (!db) return;
      while (running.size < concurrency()) {
        const job = await claimNextBriefingJob(db, [...running.keys()]);
        if (!job) break;
        const controller = new AbortController();
        running.set(job.id, controller);
        void processJob(db, job, controller)
          .catch((err) => console.error(`Briefing job ${job.id} crashed:`, err))
          .finally(() => {
            running.delete(job.id);
            void fill();
          });
      }
    } while (refill);
  } catch (err) {
    console.error('Briefing worker: claiming jobs failed:', err instanceof Error ? err.message : err);
  } finally {
    filling = false;
  }
}

/** Startet den Worker (nach initDb), setzt hängende 'running'-Jobs auf 'queued' zurück. */
export async function startBriefingWorker(): Promise<void> {
  const db = getPool();
  if (!db) return;
  try {
    const requeued = await requeueRunningBriefingJobs(db);
    if (requeued > 0) console.log(`Briefing worker: re-queued ${requeued} interrupted job(s)`);
  } catch (err) {
    console.error('Briefing worker start failed:', err);
    return;
  }
  if (!pollTimer) {
    pollTimer = setInterval(() => void fill(), pollMs());
    pollTimer.unref();
  }
  await fill();
}

/** Für Tests/Shutdown: Poll-Loop stoppen und laufende Jobs abbrechen. */
export function stopBriefingWorker(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  for (const c of running.values()) c.abort();
}

/** Für Tests/Diagnose. */
export function getBriefingWorkerState(): { running: number[] } {
  return { running: [...running.keys()] };
}

// ── Öffentliche API ──────────────────────────────────────────────────────────

/** Laufende Jobs: Fortschritt aus dem Speicher (DB-Schreibzugriffe sind gedrosselt). */
function withLiveProgress(job: BriefingJob): BriefingJob {
  const live = liveProgress.get(job.id);
  return live && job.status === 'running' ? { ...job, progress: live.map((p) => ({ ...p })) } : job;
}

/** Legt einen Job an (oder gibt den laufenden/wartenden Job derselben Analyse zurück). */
export async function enqueueBriefing(input: EnqueueBriefingInput): Promise<BriefingJob> {
  const sections = normalizeBriefingSections(input.sections ?? []);
  const db = requireDb();
  const existing = await findOpenBriefingJob(db, input.analysisId);
  if (existing) return withLiveProgress(existing);
  const analysis = await getAnalysisById(db, input.analysisId);
  if (!analysis) throw new NotFoundError('Analysis not found');

  const id = await insertBriefingJob(db, {
    analysisId: input.analysisId,
    sections,
    progress: initialProgress(sections),
    companyName: hostnameOf(analysis.finalUrl || analysis.url),
    createdBy: input.createdBy,
    batchId: input.batchId,
  });
  await saveSummary(db, input.analysisId, { jobId: id, status: 'queued', overallScore: null });
  const job = await getBriefingJob(db, id);
  if (!job) throw new Error('Briefing job could not be created');
  void fill();
  return job;
}

export async function getBriefingState(jobId: number): Promise<BriefingStateResponse> {
  const found = await getBriefingJobWithResult(requireDb(), jobId);
  if (!found) return { job: null, result: null };
  return { job: withLiveProgress(found.job), result: found.job.status === 'done' ? found.result : null };
}

/** Neuester Job (beliebiger Status) einer Analyse. */
export async function getLatestBriefingForAnalysis(analysisId: number): Promise<BriefingStateResponse> {
  const id = await getLatestBriefingJobId(requireDb(), analysisId);
  return id === null ? { job: null, result: null } : getBriefingState(id);
}

/** queued → sofort cancelled; running → Abbruch per AbortController; Endzustände bleiben unverändert. */
export async function cancelBriefing(jobId: number): Promise<BriefingJob> {
  const db = requireDb();
  const job = await getBriefingJob(db, jobId);
  if (!job) throw new NotFoundError('Briefing not found');
  if (job.status === 'queued') {
    if (await cancelQueuedBriefingJob(db, jobId)) {
      await saveSummary(db, job.analysisId, { jobId, status: 'cancelled', overallScore: null });
    }
  } else if (job.status === 'running') {
    const controller = running.get(jobId);
    await markRunningBriefingCancelled(db, jobId);
    if (controller) controller.abort();
    else await saveSummary(db, job.analysisId, { jobId, status: 'cancelled', overallScore: null });
  }
  return (await getBriefingJob(db, jobId)) ?? job;
}

/** Self-contained HTML des fertigen Reports, null wenn nicht vorhanden. */
export async function getBriefingHtml(jobId: number): Promise<string | null> {
  return getBriefingJobHtml(requireDb(), jobId);
}

/**
 * Client Pre-Briefing (powered by Chris Whitehead) im Batch-Modus: Cap, Enqueue pro Item,
 * Status-Refresh beim Lesen und ZIP-Export. Die Job-Queue läuft unabhängig vom Batch.
 */
import JSZip from 'jszip';
import * as queue from './briefing/queue.js';
import { csvCell } from './batchExport.js';
import type { BatchEnrichmentState } from './batchEnrichment.js';
import type { DbHandle } from '../db/types.js';
import {
  BRIEFING_LOCKED_SECTION,
  BRIEFING_SECTION_IDS,
  type BriefingJobStatus,
  type BriefingSectionId,
  type BriefingStateResponse,
  type BriefingSummary,
} from '../types/briefing.js';
import { MAX_BRIEFING_ITEMS, type BatchEnrichmentOptions, type BatchItemEnrichments } from '../types/batchAccount.js';
import type { BatchItem, BatchJob } from '../types/parity.js';

export { MAX_BRIEFING_ITEMS };

/** Indirektion auf die Job-Queue (in Tests austauschbar). */
export interface BriefingDeps {
  enqueueBriefing: typeof queue.enqueueBriefing;
  getBriefingState: typeof queue.getBriefingState;
  getLatestBriefingForAnalysis: typeof queue.getLatestBriefingForAnalysis;
  getBriefingHtml: typeof queue.getBriefingHtml;
}

const realDeps: BriefingDeps = {
  enqueueBriefing: (input) => queue.enqueueBriefing(input),
  getBriefingState: (jobId) => queue.getBriefingState(jobId),
  getLatestBriefingForAnalysis: (analysisId) => queue.getLatestBriefingForAnalysis(analysisId),
  getBriefingHtml: (jobId) => queue.getBriefingHtml(jobId),
};
let currentDeps: BriefingDeps = realDeps;

export function briefingDeps(): BriefingDeps {
  return currentDeps;
}

/** Nur für Tests: Queue-Funktionen ersetzen (null = Originale). */
export function setBriefingDeps(deps: Partial<BriefingDeps> | null): void {
  currentDeps = deps ? { ...realDeps, ...deps } : realDeps;
}

const TERMINAL: ReadonlySet<BriefingJobStatus> = new Set(['done', 'error', 'cancelled']);
export const isTerminalBriefing = (s: BriefingJobStatus): boolean => TERMINAL.has(s);

/** Gültige Abschnitte in Standard-Reihenfolge; leer/fehlend = alle; s14 immer enthalten. */
export function normalizeBriefingSections(ids?: readonly string[] | null): BriefingSectionId[] {
  const set = new Set<string>(ids && ids.length > 0 ? ids : BRIEFING_SECTION_IDS);
  set.add(BRIEFING_LOCKED_SECTION);
  return BRIEFING_SECTION_IDS.filter((id) => set.has(id));
}

/** Effektive Anzahl Briefings pro Batch: min(maxCostlyItems, 20); 0 wenn aus (auch alte Batches). */
export function briefingCap(options?: BatchEnrichmentOptions | null): number {
  if (options?.briefing !== true) return 0;
  const max = Math.floor(Number(options.maxCostlyItems));
  return Math.max(0, Math.min(Number.isFinite(max) ? max : MAX_BRIEFING_ITEMS, MAX_BRIEFING_ITEMS));
}

export function briefingSlotAvailable(options: BatchEnrichmentOptions | undefined, state: BatchEnrichmentState): boolean {
  return (state.used.briefing ?? 0) < briefingCap(options);
}

export interface EnqueueItemBriefingInput {
  analysisId: number;
  options: BatchEnrichmentOptions | undefined;
  state: BatchEnrichmentState;
  createdBy?: string;
  batchId: number;
}

/**
 * Reiht das Briefing eines erfolgreich analysierten Items ein (blockiert den Batch nicht).
 * Liefert die zu speichernden Item-Enrichments (briefing bzw. skipped/errors).
 */
export async function enqueueItemBriefing(
  input: EnqueueItemBriefingInput,
  deps: BriefingDeps = briefingDeps(),
): Promise<Pick<BatchItemEnrichments, 'briefing' | 'errors' | 'skipped'>> {
  const { options, state } = input;
  if (options?.briefing !== true) return {};
  if (!briefingSlotAvailable(options, state)) {
    return { skipped: { briefing: `Limit of ${briefingCap(options)} briefings per batch reached` } };
  }
  state.used.briefing = (state.used.briefing ?? 0) + 1;
  try {
    const job = await deps.enqueueBriefing({
      analysisId: input.analysisId,
      sections: normalizeBriefingSections(options.briefingSections),
      createdBy: input.createdBy,
      batchId: input.batchId,
    });
    return { briefing: { jobId: job.id, status: job.status, overallScore: null } };
  } catch (err) {
    state.used.briefing -= 1;
    const msg = err instanceof Error ? err.message : String(err);
    return { errors: { briefing: `Briefing could not be queued: ${msg.replace(/https?:\/\/\S+/g, '[url]').slice(0, 120)}` } };
  }
}

/** Kompakte Zusammenfassung aus dem Queue-Zustand (null = kein Job). */
export function summarizeBriefing(state: BriefingStateResponse): BriefingSummary | null {
  const { job, result } = state;
  if (!job) return null;
  const ex = result?.executive;
  return {
    jobId: job.id,
    status: job.status,
    overallScore: ex?.overallScore ?? null,
    ...(ex ? { band: ex.band, confidence: ex.confidence, verdict: ex.verdict } : {}),
    ...(result?.generatedAt ? { generatedAt: result.generatedAt } : {}),
  };
}

async function persistItemEnrichments(db: DbHandle, itemId: number, e: BatchItemEnrichments): Promise<void> {
  await db.execute(`UPDATE batch_items SET enrichments_json = ? WHERE id = ?`, [JSON.stringify(e), itemId]);
}

/**
 * Aktualisiert Status/Score der noch laufenden Briefings (≤ 20 Lookups). Endzustände werden
 * in enrichments_json festgeschrieben, damit spätere Reads ohne Lookup auskommen.
 */
export async function refreshBatchBriefings(
  db: DbHandle | null,
  batch: BatchJob,
  deps: BriefingDeps = briefingDeps(),
): Promise<BatchJob> {
  const open = (batch.items ?? [])
    .filter((i) => i.analysisId && i.enrichments?.briefing && !isTerminalBriefing(i.enrichments.briefing.status))
    .slice(0, MAX_BRIEFING_ITEMS);
  await Promise.all(
    open.map(async (item) => {
      try {
        const summary = summarizeBriefing(await deps.getLatestBriefingForAnalysis(item.analysisId!));
        const prev = item.enrichments!.briefing!;
        if (!summary || summary.jobId < prev.jobId) return;
        item.enrichments = { ...item.enrichments, briefing: summary };
        if (db && isTerminalBriefing(summary.status)) await persistItemEnrichments(db, item.id, item.enrichments);
      } catch (err) {
        console.warn(`Batch item ${item.id}: briefing refresh failed:`, err instanceof Error ? err.message : err);
      }
    }),
  );
  return batch;
}

/** Hat der Batch noch wartende/laufende Briefings? (für Polling im UI/MCP) */
export function hasOpenBriefings(batch: BatchJob): boolean {
  return (batch.items ?? []).some((i) => i.enrichments?.briefing && !isTerminalBriefing(i.enrichments.briefing.status));
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
}

export function briefingFileName(item: Pick<BatchItem, 'id' | 'url' | 'label'>, used: Set<string> = new Set()): string {
  const base = slug(item.label?.trim() || hostOf(item.url)) || `item-${item.id}`;
  let name = `${base}-client-pre-briefing.html`;
  for (let n = 2; used.has(name); n++) name = `${base}-${n}-client-pre-briefing.html`;
  used.add(name);
  return name;
}

const SCORE_HEADER = ['Label', 'URL', 'Overall Score', 'Band', 'Confidence', 'Verdict', 'Status'];

/** Ranking (Score absteigend, ohne Score zuletzt) aller Items mit Briefing. */
export function briefingScoresCsv(items: BatchItem[]): string {
  const rows = items
    .filter((i) => i.enrichments?.briefing)
    .sort((a, b) => (b.enrichments!.briefing!.overallScore ?? -1) - (a.enrichments!.briefing!.overallScore ?? -1))
    .map((i) => {
      const b = i.enrichments!.briefing!;
      return [i.label ?? '', i.url, b.overallScore ?? '', b.band ?? '', b.confidence ?? '', b.verdict ?? '', b.status];
    });
  return '\uFEFF' + [SCORE_HEADER, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function briefingsZipFilename(batch: Pick<BatchJob, 'id' | 'title' | 'accountName'>): string {
  const base = slug(batch.accountName || batch.title || '') || `batch-${batch.id}`;
  return `${base}-client-pre-briefings-${batch.id}.zip`;
}

/** ZIP mit allen fertigen Reports + briefing-scores.csv; null wenn kein Report fertig ist. */
export async function buildBriefingsZip(
  batch: BatchJob,
  deps: BriefingDeps = briefingDeps(),
): Promise<{ buffer: Buffer; reports: number } | null> {
  const items = (batch.items ?? []).filter((i) => i.enrichments?.briefing);
  const zip = new JSZip();
  const names = new Set<string>();
  let reports = 0;
  for (const item of items) {
    const b = item.enrichments!.briefing!;
    if (b.status !== 'done') continue;
    const html = await deps.getBriefingHtml(b.jobId);
    if (!html) continue;
    zip.file(briefingFileName(item, names), html);
    reports++;
  }
  if (reports === 0) return null;
  zip.file('briefing-scores.csv', briefingScoresCsv(items));
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buffer, reports };
}

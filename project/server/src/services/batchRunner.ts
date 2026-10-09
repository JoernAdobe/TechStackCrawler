/**
 * In-Process-Queue für Account-/Bulk-Assessments: genau ein Item gleichzeitig,
 * kleines Delay zwischen Items. Zustand liegt vollständig in der DB, damit ein
 * Neustart laufende Batches fortsetzen kann (startBatchWorker).
 */
import { getPool } from '../db/index.js';
import {
  claimNextItem,
  getBatchHeader,
  listBatchIdsByStatus,
  requeueRunningItems,
  updateBatchItem,
  updateBatchStatus,
  type CompactDetection,
} from '../db/batches.js';
import type { DbHandle } from '../db/types.js';
import type { AnalysisResult, DetectedTechnology } from '../types/analysis.js';
import type { BatchItem } from '../types/parity.js';
import { analyzeUrl, type AnalysisWriter } from './analyzer.js';
import { scrapePage } from './scraper.js';
import { detectTechnologies } from './detector.js';
import { enrichWithAdditionalPages } from './multiPageCrawl.js';

const queue: number[] = [];
let loopRunning = false;

function itemDelayMs(): number {
  const v = Number(process.env.BATCH_ITEM_DELAY_MS);
  return Number.isFinite(v) && v >= 0 ? v : 750;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function compactDetections(
  detections: Array<Pick<DetectedTechnology, 'name' | 'categories' | 'confidence' | 'weak'>>,
): CompactDetection[] {
  return detections.map((d) => ({
    name: d.name,
    categories: d.categories,
    confidence: d.confidence,
    ...(d.weak ? { weak: true } : {}),
  }));
}

/** Rohmeldungen können Pfade/Interna enthalten – nur eine kurze, sichere Fassung speichern. */
export function friendlyItemError(raw: string): string {
  if (/Blocked unsafe/i.test(raw)) return 'URL could not be resolved or is not allowed';
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND/i.test(raw)) return 'Domain could not be resolved';
  if (/ECONNREFUSED|CONNECTION_REFUSED/i.test(raw)) return 'Connection refused';
  if (/timeout|timed out|ETIMEDOUT/i.test(raw)) return 'Timeout while loading the page';
  if (/ERR_SSL|CERT/i.test(raw)) return 'SSL/certificate error';
  if (/net::/i.test(raw)) return 'Network error while loading the page';
  return 'Analysis failed';
}

function noopWriter(onResult: (r: AnalysisResult) => void): AnalysisWriter {
  return {
    sendProgress() {},
    sendResult(r: AnalysisResult) {
      onResult(r);
    },
    sendError() {},
    close() {},
  };
}

async function runFullAnalysis(url: string): Promise<{ analysisId?: number; detections: CompactDetection[] }> {
  let result: AnalysisResult | null = null;
  // analyzeUrl speichert das Ergebnis selbst (saveAnalysis) und setzt result.id.
  await analyzeUrl(url, noopWriter((r) => { result = r; }));
  const final = result as AnalysisResult | null;
  if (!final) throw new Error('No analysis result');
  return { analysisId: final.id, detections: compactDetections(final.rawDetections ?? []) };
}

async function runDetectionOnly(url: string): Promise<CompactDetection[]> {
  const scraped = await scrapePage(url);
  let detected = await detectTechnologies(scraped);
  if (process.env.BATCH_MULTI_PAGE === '1') {
    try {
      detected = (await enrichWithAdditionalPages(scraped, detected)).detected;
    } catch (err) {
      console.error('Batch multi-page enrichment failed (continuing):', err);
    }
  }
  return compactDetections(detected);
}

async function processItem(db: DbHandle, item: BatchItem, aiAnalysis: boolean): Promise<void> {
  try {
    if (aiAnalysis) {
      const { analysisId, detections } = await runFullAnalysis(item.url);
      await updateBatchItem(db, item.id, { status: 'done', analysisId, detections });
    } else {
      const detections = await runDetectionOnly(item.url);
      await updateBatchItem(db, item.id, { status: 'done', detections });
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    console.error(`Batch item ${item.id} (${item.url}) failed:`, raw);
    await updateBatchItem(db, item.id, { status: 'failed', error: friendlyItemError(raw) });
  }
}

async function processBatch(db: DbHandle, batchId: number): Promise<void> {
  const header = await getBatchHeader(db, batchId);
  if (!header || (header.status !== 'queued' && header.status !== 'running')) return;
  await updateBatchStatus(db, batchId, 'running');

  for (;;) {
    const current = await getBatchHeader(db, batchId);
    if (!current || current.status !== 'running') return; // cancelled/rejected/gelöscht
    const item = await claimNextItem(db, batchId);
    if (!item) break;
    await processItem(db, item, header.aiAnalysis);
    await sleep(itemDelayMs());
  }

  const final = await getBatchHeader(db, batchId);
  if (!final || final.status !== 'running') return;
  const allFailed = final.total > 0 && final.failed === final.total;
  await updateBatchStatus(db, batchId, allFailed ? 'failed' : 'completed');
}

async function runLoop(): Promise<void> {
  if (loopRunning) return;
  loopRunning = true;
  try {
    while (queue.length > 0) {
      const batchId = queue[0];
      const db = getPool();
      if (!db) {
        console.warn('Batch worker: database not available, pausing queue');
        break;
      }
      try {
        await processBatch(db, batchId);
      } catch (err) {
        console.error(`Batch ${batchId} processing error:`, err);
        try {
          await updateBatchStatus(db, batchId, 'failed');
        } catch {
          // DB weg – beim nächsten Start setzt startBatchWorker fort.
        }
      }
      queue.shift();
    }
  } finally {
    loopRunning = false;
  }
}

/** Reiht einen Batch (Status queued/running) zur Verarbeitung ein. */
export function enqueueBatch(id: number): void {
  if (!queue.includes(id)) queue.push(id);
  void runLoop();
}

/** Beim Serverstart: running-Items zurücksetzen und offene Batches fortsetzen. */
export async function startBatchWorker(): Promise<void> {
  const db = getPool();
  if (!db) return;
  try {
    await requeueRunningItems(db);
    const ids = await listBatchIdsByStatus(db, ['running', 'queued']);
    for (const id of ids) enqueueBatch(id);
    if (ids.length > 0) console.log(`Batch worker: resuming ${ids.length} batch(es)`);
  } catch (err) {
    console.error('Batch worker start failed:', err);
  }
}

/** Für Tests/Diagnose. */
export function getBatchQueueState(): { queued: number[]; running: boolean } {
  return { queued: [...queue], running: loopRunning };
}

/**
 * In-Process-Queue für Account-/Bulk-Assessments: genau ein Item gleichzeitig,
 * kleines Delay zwischen Items. Pro Item laufen optional die Enrichments der
 * Einzelanalyse (batchEnrichment.ts) – gedrosselt, budgetiert, fehlerisoliert. Zustand liegt vollständig in der DB, damit ein
 * Neustart laufende Batches fortsetzen kann (startBatchWorker).
 */
import { getPool } from '../db/index.js';
import {
  claimNextItem,
  getBatchHeader,
  getBatchItems,
  listBatchIdsByStatus,
  requeueRunningItems,
  updateBatchItem,
  updateBatchStatus,
  type CompactDetection,
} from '../db/batches.js';
import type { DbHandle } from '../db/types.js';
import type { AnalysisResult, DetectedTechnology, ScanWarning } from '../types/analysis.js';
import type { BatchItem, BatchJob } from '../types/parity.js';
import type { BatchEnrichmentOptions, BatchItemEnrichments } from '../types/batchAccount.js';
import { analyzeUrl, type AnalysisWriter } from './analyzer.js';
import { scrapePage } from './scraper.js';
import { detectTechnologies } from './detector.js';
import { enrichWithAdditionalPages } from './multiPageCrawl.js';
import { assessPageHealth, detectionCountWarning } from './pageHealth.js';
import { PRE_CONSENT_WARNING } from './consentAudit.js';
import { updateAnalysis } from '../db/analyses.js';
import {
  COSTLY_SOURCES,
  createEnrichmentState,
  hasAnyEnrichment,
  runItemEnrichments,
  type BatchEnrichmentState,
  type EnrichmentDeps,
} from './batchEnrichment.js';

const queue: number[] = [];
let loopRunning = false;

function itemDelayMs(): number {
  const v = Number(process.env.BATCH_ITEM_DELAY_MS);
  return Number.isFinite(v) && v >= 0 ? v : 750;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function compactDetections(
  detections: Array<Pick<DetectedTechnology, 'name' | 'categories' | 'confidence' | 'weak'> & { evidence?: string[] }>,
): CompactDetection[] {
  return detections.map((d) => ({
    name: d.name,
    categories: d.categories,
    confidence: d.confidence,
    ...(d.weak ? { weak: true } : {}),
    // Pre-Consent-Markierung aus annotatePreConsent (evidence wird sonst verworfen).
    ...(d.evidence?.includes(PRE_CONSENT_WARNING) ? { preConsent: true } : {}),
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

interface ItemScan {
  analysisId?: number;
  detections: CompactDetection[];
  raw: DetectedTechnology[];
  analysis?: AnalysisResult;
  html?: string;
  bodyText?: string;
  scanWarnings: ScanWarning[];
}

async function runFullAnalysis(url: string): Promise<ItemScan> {
  let result: AnalysisResult | null = null;
  // analyzeUrl speichert das Ergebnis selbst (saveAnalysis) und setzt result.id.
  await analyzeUrl(url, noopWriter((r) => { result = r; }), { autoObservePoint: false });
  const final = result as AnalysisResult | null;
  if (!final) throw new Error('No analysis result');
  const raw = final.rawDetections ?? [];
  return {
    analysisId: final.id,
    detections: compactDetections(raw),
    raw,
    analysis: final,
    scanWarnings: final.scanWarnings ?? [],
  };
}

async function runDetectionOnly(url: string, multiPage: boolean): Promise<ItemScan> {
  const scraped = await scrapePage(url);
  let detected = await detectTechnologies(scraped);
  if (multiPage || process.env.BATCH_MULTI_PAGE === '1') {
    try {
      detected = (await enrichWithAdditionalPages(scraped, detected)).detected;
    } catch (err) {
      console.error('Batch multi-page enrichment failed (continuing):', err instanceof Error ? err.message : err);
    }
  }
  const warnings = [...assessPageHealth(scraped).warnings];
  const countWarning = detectionCountWarning(detected.filter((d) => !d.weak).length);
  if (countWarning) warnings.push(countWarning);
  return {
    detections: compactDetections(detected),
    raw: detected,
    html: scraped.html,
    bodyText: scraped.bodyText,
    scanWarnings: warnings,
  };
}

/** Enrichments ausführen und – falls eine Einzelanalyse existiert – dort voll persistieren. */
async function enrichItem(
  db: DbHandle,
  item: BatchItem,
  header: BatchJob,
  scan: ItemScan,
  state: BatchEnrichmentState,
  deps?: EnrichmentDeps,
): Promise<BatchItemEnrichments> {
  const base: BatchItemEnrichments = scan.scanWarnings.length
    ? { scanWarnings: scan.scanWarnings.map((w) => ({ code: w.code, severity: w.severity, message: w.message })) }
    : {};
  const options = header.enrichmentOptions;
  if (!options || !hasAnyEnrichment(options)) return base;
  const outcome = await runItemEnrichments(
    {
      url: item.url,
      label: item.label,
      lens: header.lens,
      detections: scan.raw,
      analysis: scan.analysis,
      html: scan.html,
      bodyText: scan.bodyText,
    },
    options,
    state,
    deps,
  );
  if (scan.analysisId && scan.analysis) {
    try {
      const hasFull = Object.keys(outcome.full).length > 0;
      if (hasFull || outcome.useCaseDiscovery) {
        await updateAnalysis(db, scan.analysisId, {
          ...(hasFull ? { enrichments: { ...(scan.analysis.enrichments ?? {}), ...outcome.full } } : {}),
          ...(outcome.useCaseDiscovery
            ? { useCaseDiscovery: outcome.useCaseDiscovery, sitemapUrls: outcome.sitemapUrls ?? [] }
            : {}),
        });
      }
    } catch (err) {
      console.error(`Batch item ${item.id}: persisting enrichments failed:`, err instanceof Error ? err.message : err);
    }
  }
  return { ...base, ...outcome.compact };
}

/** Bereits verbrauchtes Budget (z. B. nach Neustart) aus den fertigen Items zurückrechnen. */
export function initialEnrichmentState(items: BatchItem[]): BatchEnrichmentState {
  const state = createEnrichmentState();
  for (const item of items) {
    const e = item.enrichments;
    if (!e) continue;
    for (const src of COSTLY_SOURCES) {
      const attempted =
        Boolean(e.errors?.[src]) ||
        (src === 'semrush'
          ? e.traffic?.visits !== undefined || Boolean(e.traffic?.sources?.includes('semrush'))
          : Boolean(e[src as 'lighthouse' | 'geo' | 'useCases']));
      if (attempted) state.used[src] = (state.used[src] ?? 0) + 1;
    }
  }
  return state;
}

export async function processItem(
  db: DbHandle,
  item: BatchItem,
  header: BatchJob,
  state: BatchEnrichmentState = createEnrichmentState(),
  deps?: EnrichmentDeps,
): Promise<void> {
  let scan: ItemScan;
  try {
    scan = header.aiAnalysis
      ? await runFullAnalysis(item.url)
      : await runDetectionOnly(item.url, header.enrichmentOptions?.multiPage === true);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    console.error(`Batch item ${item.id} (${item.url}) failed:`, raw);
    await updateBatchItem(db, item.id, { status: 'failed', error: friendlyItemError(raw) });
    return;
  }
  let enrichments: BatchItemEnrichments | undefined;
  try {
    enrichments = await enrichItem(db, item, header, scan, state, deps);
  } catch (err) {
    // Enrichments dürfen ein erfolgreich erkanntes Item nie scheitern lassen.
    console.error(`Batch item ${item.id} enrichments failed:`, err instanceof Error ? err.message : err);
  }
  await updateBatchItem(db, item.id, {
    status: 'done',
    analysisId: scan.analysisId,
    detections: scan.detections,
    ...(enrichments && Object.keys(enrichments).length ? { enrichments } : {}),
  });
}

async function processBatch(db: DbHandle, batchId: number): Promise<void> {
  const header = await getBatchHeader(db, batchId);
  if (!header || (header.status !== 'queued' && header.status !== 'running')) return;
  await updateBatchStatus(db, batchId, 'running');
  const state = initialEnrichmentState(await getBatchItems(db, batchId));

  for (;;) {
    const current = await getBatchHeader(db, batchId);
    if (!current || current.status !== 'running') return; // cancelled/rejected/gelöscht
    const item = await claimNextItem(db, batchId);
    if (!item) break;
    await processItem(db, item, header, state);
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

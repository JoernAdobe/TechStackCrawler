/**
 * Persistenz für Account-/Bulk-Assessments (Tabellen `batches`, `batch_items`, siehe parityTables.ts).
 * `batches.meta_json` enthält { lens, accountName, industry, opportunityId, aiAnalysis }.
 */
import type { DbHandle } from './types.js';
import { toMysqlDatetime } from './analyses.js';
import { buildSolutionMatrix } from '../services/keyFindings.js';
import type {
  AssessmentLens,
  BatchItem,
  BatchItemStatus,
  BatchJob,
  BatchKind,
  BatchStatus,
} from '../types/parity.js';

export type CompactDetection = NonNullable<BatchItem['detections']>[number];

export interface BatchMeta {
  lens?: AssessmentLens;
  accountName?: string;
  industry?: string;
  opportunityId?: string;
  aiAnalysis: boolean;
}

export interface CreateBatchInput extends BatchMeta {
  kind: BatchKind;
  title: string;
  status: BatchStatus;
  createdBy?: string;
  items: Array<{ url: string; label?: string }>;
}

interface BatchRow {
  id: number;
  kind: string;
  title: string;
  status: string;
  meta_json: string;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  total?: number | string | null;
  done?: number | string | null;
  failed?: number | string | null;
}

interface ItemRow {
  id: number;
  batch_id: number;
  position: number;
  url: string;
  label: string | null;
  status: string;
  analysis_id: number | null;
  error: string | null;
  detections_json: string | null;
  started_at: Date | string | null;
  finished_at: Date | string | null;
}

const ITEM_COLUMNS =
  'id, batch_id, position, url, label, status, analysis_id, error, detections_json, started_at, finished_at';
const INSERT_CHUNK = 100;

function nowFor(db: DbHandle): string {
  const iso = new Date().toISOString();
  return db.dialect === 'mysql' ? toMysqlDatetime(iso) : iso;
}

function toIso(value: Date | string | null | undefined): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (value instanceof Date) return value.toISOString();
  // MySQL-DATETIME als String ("YYYY-MM-DD HH:MM:SS") ist UTC (toMysqlDatetime).
  const s = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function parseMeta(json: string): BatchMeta {
  try {
    const m = JSON.parse(json) as Partial<BatchMeta>;
    return { ...m, aiAnalysis: m.aiAnalysis === true };
  } catch {
    return { aiAnalysis: false };
  }
}

function parseDetections(json: string | null): CompactDetection[] | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as CompactDetection[]) : undefined;
  } catch {
    return undefined;
  }
}

function mapItem(r: ItemRow): BatchItem {
  return {
    id: Number(r.id),
    url: r.url,
    label: r.label ?? undefined,
    status: r.status as BatchItemStatus,
    analysisId: r.analysis_id !== null && r.analysis_id !== undefined ? Number(r.analysis_id) : undefined,
    error: r.error ?? undefined,
    detections: parseDetections(r.detections_json),
    startedAt: toIso(r.started_at),
    finishedAt: toIso(r.finished_at),
  };
}

function mapBatch(r: BatchRow): BatchJob {
  const meta = parseMeta(r.meta_json);
  return {
    id: Number(r.id),
    kind: r.kind as BatchKind,
    title: r.title,
    lens: meta.lens,
    accountName: meta.accountName,
    industry: meta.industry,
    opportunityId: meta.opportunityId,
    aiAnalysis: meta.aiAnalysis,
    status: r.status as BatchStatus,
    createdBy: r.created_by ?? undefined,
    createdAt: toIso(r.created_at) ?? '',
    updatedAt: toIso(r.updated_at) ?? '',
    total: Number(r.total ?? 0),
    done: Number(r.done ?? 0),
    failed: Number(r.failed ?? 0),
  };
}

const COUNT_COLUMNS = `
  (SELECT COUNT(*) FROM batch_items i WHERE i.batch_id = b.id) AS total,
  (SELECT COUNT(*) FROM batch_items i WHERE i.batch_id = b.id AND i.status = 'done') AS done,
  (SELECT COUNT(*) FROM batch_items i WHERE i.batch_id = b.id AND i.status = 'failed') AS failed`;

export async function createBatch(db: DbHandle, input: CreateBatchInput): Promise<number> {
  const now = nowFor(db);
  const meta: BatchMeta = {
    lens: input.lens,
    accountName: input.accountName,
    industry: input.industry,
    opportunityId: input.opportunityId,
    aiAnalysis: input.aiAnalysis,
  };
  const { insertId } = await db.execute(
    `INSERT INTO batches (kind, title, status, meta_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.kind, input.title, input.status, JSON.stringify(meta), input.createdBy ?? null, now, now],
  );
  const batchId = Number(insertId ?? 0);
  if (!batchId) throw new Error('Failed to create batch');

  for (let start = 0; start < input.items.length; start += INSERT_CHUNK) {
    const chunk = input.items.slice(start, start + INSERT_CHUNK);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const params = chunk.flatMap((it, i) => [batchId, start + i, it.url, it.label ?? null, 'queued']);
    await db.execute(
      `INSERT INTO batch_items (batch_id, position, url, label, status) VALUES ${placeholders}`,
      params,
    );
  }
  return batchId;
}

export async function getBatchItems(db: DbHandle, batchId: number): Promise<BatchItem[]> {
  const { rows } = await db.execute(
    `SELECT ${ITEM_COLUMNS} FROM batch_items WHERE batch_id = ? ORDER BY position ASC`,
    [batchId],
  );
  return (rows as ItemRow[]).map(mapItem);
}

/** Batch ohne Items/Matrix (leichtgewichtig, z. B. für Status-Checks im Runner). */
export async function getBatchHeader(db: DbHandle, id: number): Promise<BatchJob | null> {
  const { rows } = await db.execute(`SELECT b.*, ${COUNT_COLUMNS} FROM batches b WHERE b.id = ?`, [id]);
  const row = (rows as BatchRow[])[0];
  return row ? mapBatch(row) : null;
}

/** Vollständiger Batch inkl. Items und Solution-Mapping-Matrix aus allen fertigen Items. */
export async function getBatch(db: DbHandle, id: number): Promise<BatchJob | null> {
  const batch = await getBatchHeader(db, id);
  if (!batch) return null;
  const items = await getBatchItems(db, id);
  batch.items = items;
  const finished = items.filter((i) => i.status === 'done' && i.detections);
  if (finished.length > 0) {
    batch.matrix = buildSolutionMatrix(
      finished.map((i) => ({
        url: i.url,
        label: i.label,
        analysisId: i.analysisId,
        detections: i.detections ?? [],
      })),
    );
  }
  return batch;
}

export async function listBatches(db: DbHandle, limit = 50): Promise<BatchJob[]> {
  const n = Math.min(Math.max(1, Math.floor(Number(limit) || 50)), 200);
  const { rows } = await db.execute(
    `SELECT b.*, ${COUNT_COLUMNS} FROM batches b ORDER BY b.id DESC LIMIT ${n}`,
  );
  return (rows as BatchRow[]).map(mapBatch);
}

export async function listBatchIdsByStatus(db: DbHandle, statuses: BatchStatus[]): Promise<number[]> {
  if (statuses.length === 0) return [];
  const { rows } = await db.execute(
    `SELECT id FROM batches WHERE status IN (${statuses.map(() => '?').join(', ')}) ORDER BY id ASC`,
    statuses,
  );
  return (rows as Array<{ id: number }>).map((r) => Number(r.id));
}

export async function updateBatchStatus(db: DbHandle, id: number, status: BatchStatus): Promise<void> {
  await db.execute(`UPDATE batches SET status = ?, updated_at = ? WHERE id = ?`, [status, nowFor(db), id]);
}

/** Holt das nächste wartende Item (nach Position) und markiert es als running. */
export async function claimNextItem(db: DbHandle, batchId: number): Promise<BatchItem | null> {
  const { rows } = await db.execute(
    `SELECT ${ITEM_COLUMNS} FROM batch_items WHERE batch_id = ? AND status = 'queued' ORDER BY position ASC LIMIT 1`,
    [batchId],
  );
  const row = (rows as ItemRow[])[0];
  if (!row) return null;
  const now = nowFor(db);
  await db.execute(
    `UPDATE batch_items SET status = 'running', started_at = ?, error = NULL WHERE id = ? AND status = 'queued'`,
    [now, row.id],
  );
  return { ...mapItem(row), status: 'running', startedAt: toIso(now) };
}

export interface ItemUpdate {
  status: BatchItemStatus;
  analysisId?: number;
  error?: string;
  detections?: CompactDetection[];
}

export async function updateBatchItem(db: DbHandle, itemId: number, patch: ItemUpdate): Promise<void> {
  const finished = patch.status === 'done' || patch.status === 'failed' || patch.status === 'skipped';
  await db.execute(
    `UPDATE batch_items SET status = ?, analysis_id = COALESCE(?, analysis_id), error = ?,
       detections_json = COALESCE(?, detections_json), finished_at = ? WHERE id = ?`,
    [
      patch.status,
      patch.analysisId ?? null,
      patch.error ? patch.error.slice(0, 2000) : null,
      patch.detections ? JSON.stringify(patch.detections) : null,
      finished ? nowFor(db) : null,
      itemId,
    ],
  );
}

/** Nach einem Neustart: hängengebliebene running-Items wieder einreihen. */
export async function requeueRunningItems(db: DbHandle): Promise<void> {
  await db.execute(`UPDATE batch_items SET status = 'queued', started_at = NULL WHERE status = 'running'`);
}

/** Alle noch wartenden Items eines Batches überspringen (Cancel/Reject). */
export async function skipQueuedItems(db: DbHandle, batchId: number): Promise<void> {
  await db.execute(
    `UPDATE batch_items SET status = 'skipped', finished_at = ? WHERE batch_id = ? AND status = 'queued'`,
    [nowFor(db), batchId],
  );
}

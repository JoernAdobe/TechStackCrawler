/**
 * Account-Assessment (≤ 30 URLs, Lens), Bulk-Assessment (≤ 1.000 URLs, Approval ab Schwelle)
 * und Stack-History. Verarbeitung läuft asynchron im batchRunner.
 */
import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { getPool } from '../db/index.js';
import { createBatch, getBatch, getBatchHeader, listBatches, skipQueuedItems, updateBatchStatus } from '../db/batches.js';
import type { DbHandle } from '../db/types.js';
import { enqueueBatch } from '../services/batchRunner.js';
import { MAX_ACCOUNT_URLS, MAX_BULK_URLS, normalizeBatchItems, parseBatchInput } from '../services/batchInput.js';
import { batchToCsv, exportFilename } from '../services/batchExport.js';
import { getStackHistory, normalizeHostname } from '../services/stackHistory.js';
import { getSession } from '../services/sessionStore.js';
import { requireDashboardAuth } from './dashboard.js';
import {
  BadRequestError,
  DbUnavailableError,
  NotFoundError,
  asyncHandler,
  parseBody,
  parseParams,
} from '../utils/http.js';
import type { BatchStatus } from '../types/parity.js';

const SESSION_COOKIE = 'ts_session';
const WORD_START = /^[\p{L}\p{N}_]/u;

export function batchApprovalThreshold(): number {
  const v = Number(process.env.BATCH_APPROVAL_THRESHOLD);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 50;
}

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

const createSchema = z
  .object({
    kind: z.enum(['account', 'bulk']),
    title: z.string().trim().min(1).max(255).regex(WORD_START, 'Title must start with a letter, digit or underscore'),
    lens: z.enum(['Brand', 'Geo', 'Journey Stage', 'Competitors', 'Other']).optional(),
    accountName: optionalText(255),
    industry: optionalText(255),
    opportunityId: optionalText(64),
    aiAnalysis: z.boolean().optional(),
    input: z.string().max(2_000_000).optional(),
    items: z
      .array(z.object({ url: z.string().max(2048), label: z.string().max(255).optional() }))
      .max(MAX_BULK_URLS * 2)
      .optional(),
  })
  .refine((b) => (b.input && b.input.trim()) || (b.items && b.items.length > 0), {
    message: 'Either "input" or "items" is required',
    path: ['input'],
  });

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const listSchema = z.object({ limit: z.coerce.number().int().positive().max(200).default(50) });
const historySchema = z.object({ url: z.string().trim().min(1).max(2048) });

function requireDb(): DbHandle {
  const db = getPool();
  if (!db) throw new DbUnavailableError();
  return db;
}

function currentUser(req: Request): string | undefined {
  const tokens: string[] = [];
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) tokens.push(auth.slice(7).trim());
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
  if (cookie) tokens.push(cookie);
  return tokens.map((t) => getSession(t)).find((s) => s !== null)?.email;
}

async function loadHeader(db: DbHandle, id: number) {
  const batch = await getBatchHeader(db, id);
  if (!batch) throw new NotFoundError('Batch not found');
  return batch;
}

export function createBatchRoutes(opts: { limiter?: RequestHandler } = {}): Router {
  const router = Router();
  const limit: RequestHandler[] = opts.limiter ? [opts.limiter] : [];

  router.post(
    '/api/batches',
    ...limit,
    asyncHandler(async (req, res) => {
      const body = parseBody(createSchema, req.body);
      const parsed = body.items?.length
        ? normalizeBatchItems(body.items, MAX_BULK_URLS)
        : parseBatchInput(body.input ?? '', MAX_BULK_URLS);

      if (parsed.items.length === 0) {
        throw new BadRequestError('No valid URLs found', parsed.errors.map((message) => ({ path: 'input', message })));
      }
      if (body.kind === 'account' && parsed.items.length > MAX_ACCOUNT_URLS) {
        throw new BadRequestError(
          `Account assessments support up to ${MAX_ACCOUNT_URLS} URLs (got ${parsed.items.length}). Use a bulk assessment instead.`,
        );
      }

      const db = requireDb();
      const aiAnalysis = body.aiAnalysis ?? body.kind === 'account';
      const needsApproval = body.kind === 'bulk' && parsed.items.length > batchApprovalThreshold();
      const status: BatchStatus = needsApproval ? 'pending_approval' : 'queued';

      const id = await createBatch(db, {
        kind: body.kind,
        title: body.title,
        status,
        lens: body.lens,
        accountName: body.accountName,
        industry: body.industry,
        opportunityId: body.opportunityId,
        aiAnalysis,
        createdBy: currentUser(req),
        items: parsed.items,
      });
      if (status === 'queued') enqueueBatch(id);

      const batch = await getBatch(db, id);
      res.status(201).json({ batch, warnings: parsed.errors });
    }),
  );

  router.get(
    '/api/batches',
    asyncHandler(async (req, res) => {
      const { limit: n } = parseParams(listSchema, req.query);
      const db = getPool();
      res.setHeader('Cache-Control', 'no-store');
      res.json(db ? await listBatches(db, n) : []);
    }),
  );

  router.get(
    '/api/batches/:id(\\d+)',
    asyncHandler(async (req, res) => {
      const { id } = parseParams(idSchema, req.params);
      const batch = await getBatch(requireDb(), id);
      if (!batch) throw new NotFoundError('Batch not found');
      res.setHeader('Cache-Control', 'no-store');
      res.json(batch);
    }),
  );

  router.post(
    '/api/batches/:id(\\d+)/cancel',
    asyncHandler(async (req, res) => {
      const { id } = parseParams(idSchema, req.params);
      const db = requireDb();
      const batch = await loadHeader(db, id);
      if (!['pending_approval', 'queued', 'running'].includes(batch.status)) {
        throw new BadRequestError(`Batch cannot be cancelled in status "${batch.status}"`);
      }
      await updateBatchStatus(db, id, 'cancelled');
      await skipQueuedItems(db, id);
      res.json(await getBatchHeader(db, id));
    }),
  );

  router.post(
    '/api/batches/:id(\\d+)/approve',
    requireDashboardAuth,
    asyncHandler(async (req, res) => {
      const { id } = parseParams(idSchema, req.params);
      const db = requireDb();
      const batch = await loadHeader(db, id);
      if (batch.status !== 'pending_approval') {
        throw new BadRequestError(`Only batches pending approval can be approved (status "${batch.status}")`);
      }
      await updateBatchStatus(db, id, 'queued');
      enqueueBatch(id);
      res.json(await getBatchHeader(db, id));
    }),
  );

  router.post(
    '/api/batches/:id(\\d+)/reject',
    requireDashboardAuth,
    asyncHandler(async (req, res) => {
      const { id } = parseParams(idSchema, req.params);
      const db = requireDb();
      const batch = await loadHeader(db, id);
      if (batch.status !== 'pending_approval') {
        throw new BadRequestError(`Only batches pending approval can be rejected (status "${batch.status}")`);
      }
      await updateBatchStatus(db, id, 'rejected');
      await skipQueuedItems(db, id);
      res.json(await getBatchHeader(db, id));
    }),
  );

  router.get(
    '/api/batches/:id(\\d+)/export.csv',
    asyncHandler(async (req, res) => {
      const { id } = parseParams(idSchema, req.params);
      const batch = await getBatch(requireDb(), id);
      if (!batch) throw new NotFoundError('Batch not found');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(batch, 'csv')}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(batchToCsv(batch));
    }),
  );

  router.get(
    '/api/stack-history',
    asyncHandler(async (req, res) => {
      const { url } = parseParams(historySchema, req.query);
      if (!normalizeHostname(url)) throw new BadRequestError('Invalid URL or hostname');
      const db = getPool();
      res.setHeader('Cache-Control', 'no-store');
      res.json(db ? await getStackHistory(db, url) : { hostname: normalizeHostname(url), entries: [] });
    }),
  );

  return router;
}

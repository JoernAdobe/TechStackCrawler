/**
 * Feedback-Loop (EAA: Feedback-Formular). POST öffentlich (rate-limited), Liste/Status nur für Dashboard-Admins.
 */
import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { getPool } from '../db/index.js';
import { FEEDBACK_STATUSES, insertFeedback, listFeedback, updateFeedbackStatus } from '../db/feedback.js';
import { getSession } from '../services/sessionStore.js';
import type { FeedbackEntry, FeedbackType } from '../types/parity.js';
import { asyncHandler, DbUnavailableError, NotFoundError, parseBody, parseParams } from '../utils/http.js';
import { requireDashboardAuth } from './dashboard.js';

export const FEEDBACK_TYPES = [
  'Bug: Missing Solution',
  'Bug: Wrong Detection',
  'Bug',
  'Enhancement/Feature',
  'Praise',
  'Other',
] as const satisfies readonly FeedbackType[];

export const RATING_ONLY_DESCRIPTION = '(rating only)';

const missingSolutionSchema = z.object({
  url: z.string().trim().max(2048).optional().transform((v) => v || undefined),
  solution: z.string().trim().min(1, 'Solution is required').max(200),
  category: z.string().trim().max(100).optional().transform((v) => v || undefined),
});

/** Validierungsschema für POST /api/feedback (separat exportiert für Tests). */
export const feedbackBodySchema = z
  .object({
    type: z.enum(FEEDBACK_TYPES),
    rating: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
    title: z.string().trim().max(200).optional().transform((v) => v || undefined),
    description: z.string().trim().max(4000).optional().default(''),
    analysisId: z.number().int().positive().optional(),
    batchId: z.number().int().positive().optional(),
    missingSolutions: z.array(missingSolutionSchema).max(20).optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.description && v.rating === undefined) {
      ctx.addIssue({ code: 'custom', path: ['description'], message: 'Description is required' });
    }
  })
  .transform((v): FeedbackEntry => ({
    type: v.type,
    rating: v.rating,
    title: v.title,
    description: v.description || RATING_ONLY_DESCRIPTION,
    analysisId: v.analysisId,
    batchId: v.batchId,
    missingSolutions: v.missingSolutions?.length ? v.missingSolutions : undefined,
  }));

export type FeedbackBody = z.output<typeof feedbackBodySchema>;

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  status: z.enum(FEEDBACK_STATUSES).optional(),
});
const statusBodySchema = z.object({ status: z.enum(FEEDBACK_STATUSES) });

/** E-Mail aus bestehender Session (Okta/Dashboard), falls vorhanden – sonst anonym. */
function sessionEmail(req: Request): string | undefined {
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.ts_session;
  return getSession(cookieToken)?.email ?? undefined;
}

export function createFeedbackRoutes(opts: { limiter?: RequestHandler } = {}): Router {
  const router = Router();
  const guards: RequestHandler[] = opts.limiter ? [opts.limiter] : [];

  router.post(
    '/api/feedback',
    ...guards,
    asyncHandler(async (req, res) => {
      const entry = parseBody(feedbackBodySchema, req.body);
      const db = getPool();
      if (!db) throw new DbUnavailableError();
      const id = await insertFeedback(db, { ...entry, createdBy: sessionEmail(req), status: 'open' });
      res.status(201).json({ ok: true, id });
    }),
  );

  router.get(
    '/api/feedback',
    requireDashboardAuth,
    asyncHandler(async (req, res) => {
      const { limit, status } = parseParams(listQuerySchema, req.query);
      const db = getPool();
      if (!db) {
        res.json([]);
        return;
      }
      res.json(await listFeedback(db, limit, status));
    }),
  );

  router.patch(
    '/api/feedback/:id',
    requireDashboardAuth,
    asyncHandler(async (req, res) => {
      const { id } = parseParams(idParamSchema, req.params);
      const { status } = parseBody(statusBodySchema, req.body);
      const db = getPool();
      if (!db) throw new DbUnavailableError();
      const ok = await updateFeedbackStatus(db, id, status);
      if (!ok) throw new NotFoundError('Feedback not found');
      res.json({ ok: true, id, status });
    }),
  );

  return router;
}

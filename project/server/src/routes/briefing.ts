/**
 * Client Pre-Briefing – powered by Chris Whitehead.
 * REST-API laut API-Kommentar in types/briefing.ts; Verarbeitung asynchron in services/briefing/queue.ts.
 */
import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { getPool } from '../db/index.js';
import { getSession } from '../services/sessionStore.js';
import {
  cancelBriefing,
  enqueueBriefing,
  getBriefingHtml,
  getBriefingState,
  getLatestBriefingForAnalysis,
} from '../services/briefing/queue.js';
import { htmlToPdf, PdfUnavailableError } from '../services/briefing/pdf.js';
import { renderBriefingHtml } from '../services/briefing/render.js';
import { analysisHost, buildAnalysisReportHtml, type LicenseSizingRow } from '../services/analysisReport.js';
import { getAnalysisById } from '../db/analyses.js';
import { getLatestDoneBriefingResult } from '../db/briefingJobs.js';
import type { BriefingJob, BriefingStateResponse } from '../types/briefing.js';
import {
  DbUnavailableError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  asyncHandler,
  parseBody,
  parseParams,
} from '../utils/http.js';

const SESSION_COOKIE = 'ts_session';

const analysisIdSchema = z.object({ id: z.coerce.number().int().positive() });

const str = (max: number) => z.string().max(max);
const num = z.number().finite().min(0).max(1e15);
const sizingRowsSchema = z.array(z.object({
  product: str(120), metric: str(200), unit: str(80), low: num, mid: num, high: num,
  licenseUnit: str(200), licenseUnits: num.optional(), confidence: str(20), detected: z.array(str(120)).max(10).optional(),
})).max(20);

/** License-Sizing-Zeilen aus ?sizing= (vom Client berechnet); ungültige Eingaben werden ignoriert. */
function parseSizing(raw: unknown): LicenseSizingRow[] {
  if (typeof raw !== 'string' || !raw || raw.length > 20_000) return [];
  try {
    const parsed = sizingRowsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
const jobIdSchema = z.object({ jobId: z.coerce.number().int().positive() });
/** Bekannte IDs prüft normalizeBriefingSections (→ 400 mit Liste der erlaubten IDs). */
const startSchema = z.object({
  sections: z.array(z.string().trim().min(1).max(8)).max(32),
});

/** Report-HTML enthält Chris' Inline-CSS/-Script; sonst nichts nachladen. */
const REPORT_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

function requireDb(): void {
  if (!getPool()) throw new DbUnavailableError();
}

function currentSession(req: Request) {
  const tokens: string[] = [];
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) tokens.push(auth.slice(7).trim());
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
  if (cookie) tokens.push(cookie);
  return tokens.map((t) => getSession(t)).find((s) => s !== null) ?? null;
}

/** createdBy (E-Mail) nur für Admins und den Ersteller selbst sichtbar. */
function redactJob(job: BriefingJob, req: Request): BriefingJob {
  const session = currentSession(req);
  if (!job.createdBy || session?.isAdmin || (session && job.createdBy === session.email)) return job;
  return { ...job, createdBy: undefined };
}

function redactState(state: BriefingStateResponse, req: Request): BriefingStateResponse {
  return state.job ? { ...state, job: redactJob(state.job, req) } : state;
}

export function briefingFilename(companyName: string | undefined, jobId: number): string {
  const kebab = (companyName ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return `${kebab || `briefing-${jobId}`}-client-pre-briefing.html`;
}

async function renderPdf(html: string): Promise<Buffer> {
  try {
    return await htmlToPdf(html);
  } catch (err) {
    if (err instanceof PdfUnavailableError) throw new ServiceUnavailableError(err.message);
    throw err;
  }
}

export function createBriefingRoutes(opts: { startLimiter?: RequestHandler; readLimiter?: RequestHandler } = {}): Router {
  const router = Router();
  const start: RequestHandler[] = opts.startLimiter ? [opts.startLimiter] : [];
  const read: RequestHandler[] = opts.readLimiter ? [opts.readLimiter] : [];

  router.post(
    '/api/analyses/:id(\\d+)/briefing',
    ...start,
    asyncHandler(async (req, res) => {
      const { id } = parseParams(analysisIdSchema, req.params);
      const body = parseBody(startSchema, req.body);
      requireDb();
      const before = await getLatestBriefingForAnalysis(id);
      const job = await enqueueBriefing({
        analysisId: id,
        sections: body.sections as never,
        createdBy: currentSession(req)?.email,
      });
      const existing = before.job?.id === job.id;
      res.setHeader('Cache-Control', 'no-store');
      res.status(existing ? 200 : 202).json(redactJob(job, req));
    }),
  );

  router.get(
    '/api/analyses/:id(\\d+)/briefing',
    ...read,
    asyncHandler(async (req, res) => {
      const { id } = parseParams(analysisIdSchema, req.params);
      requireDb();
      res.setHeader('Cache-Control', 'no-store');
      res.json(redactState(await getLatestBriefingForAnalysis(id), req));
    }),
  );

  router.get(
    '/api/briefings/:jobId(\\d+)',
    ...read,
    asyncHandler(async (req, res) => {
      const { jobId } = parseParams(jobIdSchema, req.params);
      requireDb();
      const state = await getBriefingState(jobId);
      if (!state.job) throw new NotFoundError('Briefing not found');
      res.setHeader('Cache-Control', 'no-store');
      res.json(redactState(state, req));
    }),
  );

  router.post(
    '/api/briefings/:jobId(\\d+)/cancel',
    ...read,
    asyncHandler(async (req, res) => {
      const { jobId } = parseParams(jobIdSchema, req.params);
      requireDb();
      const { job } = await getBriefingState(jobId);
      if (!job) throw new NotFoundError('Briefing not found');
      const session = currentSession(req);
      if (job.createdBy && !session?.isAdmin && job.createdBy !== session?.email) {
        throw new ForbiddenError('Only the creator or an admin can cancel this briefing');
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json(redactJob(await cancelBriefing(jobId), req));
    }),
  );

  router.get(
    '/api/briefings/:jobId(\\d+)/report.html',
    ...read,
    asyncHandler(async (req, res) => {
      const { jobId } = parseParams(jobIdSchema, req.params);
      requireDb();
      const html = await getBriefingHtml(jobId);
      if (html === null) throw new NotFoundError('Briefing report not ready');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Security-Policy', REPORT_CSP);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (req.query.download === '1') {
        const { job } = await getBriefingState(jobId);
        res.setHeader('Content-Disposition', `attachment; filename="${briefingFilename(job?.companyName, jobId)}"`);
      }
      res.type('text/html; charset=utf-8').send(html);
    }),
  );

  router.get(
    '/api/briefings/:jobId(\\d+)/report.pdf',
    ...read,
    asyncHandler(async (req, res) => {
      const { jobId } = parseParams(jobIdSchema, req.params);
      requireDb();
      const html = await getBriefingHtml(jobId);
      if (html === null) throw new NotFoundError('Briefing report not ready');
      const pdf = await renderPdf(html);
      const { job } = await getBriefingState(jobId);
      const filename = briefingFilename(job?.companyName, jobId).replace(/\.html$/, '.pdf');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.type('application/pdf').send(pdf);
    }),
  );

  // Komplettreport der Analyse (Pre-Briefing, falls vorhanden, + alle Tabs; ?sizing= = License Sizing aus dem Client).
  router.get(
    '/api/analyses/:id(\\d+)/report.pdf',
    ...read,
    asyncHandler(async (req, res) => {
      const { id } = parseParams(analysisIdSchema, req.params);
      requireDb();
      const pool = getPool()!;
      const analysis = await getAnalysisById(pool, id);
      if (!analysis) throw new NotFoundError('Analysis not found');
      const briefing = await getLatestDoneBriefingResult(pool, id);
      const sizing = parseSizing(req.query.sizing);
      const pdf = await renderPdf(buildAnalysisReportHtml(analysis, briefing ? renderBriefingHtml(briefing) : null, sizing));
      const host = analysisHost(analysis).toLowerCase().replace(/[^a-z0-9.-]+/g, '-').slice(0, 60) || `analysis-${id}`;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `attachment; filename="${host}-account-radar.pdf"`);
      res.type('application/pdf').send(pdf);
    }),
  );

  return router;
}

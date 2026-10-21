/**
 * Usage-Tracking-Middleware: vergibt eine anonyme Besucher-ID (Cookie `ts_vid`)
 * und protokolliert relevante Aktionen (Analyse, Briefing, Exporte …) nach
 * Abschluss des Requests in `usage_events`. Fehler beim Schreiben blockieren nie.
 */
import { randomBytes } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { getPool } from '../db/index.js';
import { insertUsageEvent } from '../db/usageEvents.js';
import { getSession } from './sessionStore.js';

export const VISITOR_COOKIE = 'ts_vid';
const SESSION_COOKIE = 'ts_session';
const VISITOR_TTL_MS = 400 * 24 * 60 * 60 * 1000;
const VISITOR_RE = /^[a-f0-9]{32}$/;

/** Server-zu-Server-Kanäle ohne Browser-Cookie. */
export const SYSTEM_VISITORS = new Set(['integration', 'mcp']);

type Rule = [method: string, pattern: RegExp, event: string];

const RULES: Rule[] = [
  ['POST', /^\/api\/analyze-sync$/, 'analysis'],
  ['POST', /^\/api\/use-case-discovery$/, 'use_cases'],
  ['POST', /^\/api\/analyses\/(\d+)\/briefing$/, 'briefing'],
  ['POST', /^\/api\/analyses\/(\d+)\/enrich\/geo$/, 'geo_score'],
  ['POST', /^\/api\/analyses\/(\d+)\/enrich\/observepoint$/, 'observepoint'],
  ['GET', /^\/api\/analyses\/(\d+)\/report\.pdf$/, 'export_pdf'],
  ['GET', /^\/api\/briefings\/\d+\/report\.pdf$/, 'export_briefing_pdf'],
  ['GET', /^\/api\/briefings\/\d+\/report\.html$/, 'export_briefing_html'],
  ['GET', /^\/api\/analyses\/(\d+)\/deck\.pptx$/, 'export_deck'],
  ['GET', /^\/api\/batches\/\d+\/(deck\.pptx|export\.(csv|md)|briefings\.zip)$/, 'export_batch'],
  ['GET', /^\/api\/analyses\/(\d+)$/, 'account_view'],
  ['GET', /^\/api\/library$/, 'library_view'],
  ['POST', /^\/api\/batches$/, 'batch'],
  ['POST', /^\/api\/feedback$/, 'feedback'],
  ['POST', /^\/api\/tts$/, 'tts'],
  ['GET', /^\/api\/integration\/accounts\/[^/]+\/context$/, 'rfp_context'],
  ['POST', /^\/mcp/, 'mcp_call'],
];

/** Vom Client gemeldete, rein clientseitige Aktionen (Downloads ohne Server-Request). */
export const CLIENT_EVENTS = ['visit', 'export_markdown', 'export_excel'] as const;

export function matchUsageEvent(method: string, path: string): { event: string; analysisId: number | null } | null {
  for (const [m, re, event] of RULES) {
    if (m !== method) continue;
    const hit = re.exec(path);
    if (hit) return { event, analysisId: hit[1] && /^\d+$/.test(hit[1]) ? Number(hit[1]) : null };
  }
  return null;
}

function cookies(req: Request): Record<string, string> {
  return (req as Request & { cookies?: Record<string, string> }).cookies ?? {};
}

function setVisitorCookie(res: Response, id: string): void {
  if (res.headersSent) return;
  res.cookie(VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: VISITOR_TTL_MS,
    path: '/',
  });
}

/**
 * Besucher-ID: führend ist die localStorage-ID des Clients (Header/Body), das
 * Cookie spiegelt sie für Downloads und reine Links; ohne beides neue ID.
 */
export function visitorIdOf(req: Request, res: Response, clientId?: unknown): string {
  if (req.path.startsWith('/api/integration/')) return 'integration';
  if (req.path.startsWith('/mcp')) return 'mcp';
  const fromClient = typeof clientId === 'string' ? clientId : req.header('x-visitor-id');
  const cookie = cookies(req)[VISITOR_COOKIE];
  if (fromClient && VISITOR_RE.test(fromClient)) {
    if (cookie !== fromClient) setVisitorCookie(res, fromClient);
    return fromClient;
  }
  if (cookie && VISITOR_RE.test(cookie)) return cookie;
  const id = randomBytes(16).toString('hex');
  setVisitorCookie(res, id);
  return id;
}

export function recordUsage(req: Request, visitorId: string, event: string, analysisId: number | null, status: number): void {
  const pool = getPool();
  if (!pool) return;
  const email = getSession(cookies(req)[SESSION_COOKIE])?.email ?? null;
  insertUsageEvent(pool, { tsMs: Date.now(), visitorId, email, event, analysisId, status }).catch((err) => {
    console.warn('[usage] Event konnte nicht gespeichert werden:', err instanceof Error ? err.message : err);
  });
}

export function usageTracking(req: Request, res: Response, next: NextFunction): void {
  const match = matchUsageEvent(req.method, req.path);
  if (!match) {
    next();
    return;
  }
  // Cookie muss vor dem Senden der Header gesetzt sein.
  const visitorId = visitorIdOf(req, res);
  res.on('finish', () => recordUsage(req, visitorId, match.event, match.analysisId, res.statusCode));
  next();
}

/** POST /api/usage {event, analysisId?} – Beacon für clientseitige Aktionen (Whitelist). */
export function usageBeaconRoute(req: Request, res: Response): void {
  const body = (req.body ?? {}) as { event?: unknown; analysisId?: unknown; visitorId?: unknown };
  const event = typeof body.event === 'string' ? body.event : '';
  if (!(CLIENT_EVENTS as readonly string[]).includes(event)) {
    res.status(400).json({ error: 'Unknown event', code: 'bad_request' });
    return;
  }
  const analysisId = Number.isInteger(body.analysisId) && (body.analysisId as number) > 0 ? (body.analysisId as number) : null;
  const visitorId = visitorIdOf(req, res, body.visitorId);
  recordUsage(req, visitorId, event, analysisId, 200);
  res.status(204).end();
}

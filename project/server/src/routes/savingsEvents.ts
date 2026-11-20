/**
 * Server-zu-Server-Endpunkt für Digest Studio: normalisierte Nutzungs-Events zur
 * Berechnung eingesparter Stunden. Read-only, geschützt per Bearer-Token
 * (Env SAVINGS_EVENTS_TOKEN); ohne gesetztes Secret deaktiviert (503).
 * Datenschutz (OneTrust-PIA): Antwort enthält nur pseudonyme user_hash-Werte, keine E-Mails.
 */
import { timingSafeEqual } from 'crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { getPool } from '../db/index.js';
import { config } from '../config.js';
import { asyncHandler } from '../utils/http.js';
import { collectSavingsEvents, type SavingsEvent } from '../services/savingsEvents.js';

function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireSavingsToken(req: Request, res: Response, next: NextFunction) {
  const expected = (process.env.SAVINGS_EVENTS_TOKEN || '').trim();
  if (!expected) {
    res.status(503).json({ detail: 'savings events disabled' });
    return;
  }
  const match = /^Bearer\s+(.+)$/i.exec(String(req.header('authorization') || '').trim());
  const given = match ? match[1].trim() : '';
  if (!given || !tokenMatches(given, expected)) {
    res.status(401).json({ detail: 'invalid token' });
    return;
  }
  next();
}

/** Feste Feld-Whitelist: neue Felder im Service landen nicht ungeprüft im Export. */
export function toPublicEvent(e: SavingsEvent): SavingsEvent {
  return {
    external_id: e.external_id,
    capability: e.capability,
    occurred_at: e.occurred_at,
    user_hash: e.user_hash,
    units: e.units,
    dedupe_key: e.dedupe_key,
    meta: e.meta,
  };
}

function parseTime(value: unknown, fallback: number): number | null {
  if (value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function createSavingsEventsRoutes(opts: { limiter?: (req: Request, res: Response, next: NextFunction) => void } = {}) {
  const router = Router();
  const path = '/api/internal/savings-events';
  if (opts.limiter) router.use(path, opts.limiter);
  router.get(
    path,
    requireSavingsToken,
    asyncHandler(async (req, res) => {
      const now = Date.now();
      const sinceMs = parseTime(req.query.since, 0);
      const untilMs = parseTime(req.query.until, now);
      if (sinceMs == null || untilMs == null) {
        res.status(400).json({ detail: 'since/until must be ISO 8601 timestamps' });
        return;
      }
      const pool = getPool();
      if (!pool) {
        res.status(503).json({ detail: 'database unavailable' });
        return;
      }
      const events = untilMs > sinceMs ? await collectSavingsEvents(pool, { sinceMs, untilMs, adminEmails: config.adminEmails }) : [];
      res.json({ tool: 'radar', generated_at: new Date(now).toISOString(), events: events.map(toPublicEvent) });
    }),
  );
  return router;
}

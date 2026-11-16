/**
 * App-weite Okta-Pflicht: jeder /api-Aufruf braucht eine gültige Session
 * (Okta-Cookie oder Break-Glass-Bearer). Nur so lässt sich Nutzung einem
 * Adobe-User zuordnen (usage_events.email, briefing_jobs.created_by).
 *
 * Ausgenommen sind Pfade mit eigener Auth (Integration-/Savings-Tokens) und
 * die Endpunkte, die der Client vor dem Login braucht.
 */
import type { NextFunction, Request, Response } from 'express';
import { getSession } from '../services/sessionStore.js';

const SESSION_COOKIE = 'ts_session';

const PUBLIC_EXACT = new Set([
  '/api/health',
  '/api/bedrock-status',
  '/api/dashboard/session',
  '/api/dashboard/login',
]);
const PUBLIC_PREFIXES = ['/api/internal/', '/api/integration/'];

export function isPublicApiPath(path: string): boolean {
  if (!path.startsWith('/api/') && path !== '/api') return true;
  if (PUBLIC_EXACT.has(path)) return true;
  return PUBLIC_PREFIXES.some((p) => path.startsWith(p) || path === p.slice(0, -1));
}

export function hasValidSession(req: Request): boolean {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ') && getSession(auth.slice(7).trim())) return true;
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
  return Boolean(cookie && getSession(cookie));
}

export function createSessionGate(enabled: () => boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!enabled() || isPublicApiPath(req.path) || hasValidSession(req)) {
      next();
      return;
    }
    res.status(401).json({ error: 'Login required.', code: 'auth_required' });
  };
}

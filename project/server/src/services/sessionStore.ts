/**
 * Gemeinsamer In-Memory Session-Store für Dashboard-Auth.
 *
 * Wird sowohl vom Okta-OIDC-Flow (routes/oktaAuth.ts) als auch vom
 * Break-Glass-Passwort-Login (routes/dashboard.ts) genutzt, damit beide
 * dieselben Tokens/Cookies und dieselbe requireDashboardAuth-Middleware teilen.
 *
 * Prozess-lokal & flüchtig: überlebt keinen Neustart und wird nicht über mehrere
 * Worker synchronisiert. Für den aktuellen Single-Instance-Betrieb ausreichend;
 * für Multi-Worker-Betrieb gegen Redis o.ä. tauschen.
 */
import { randomBytes } from 'crypto';

interface Session {
  email: string;
  isAdmin: boolean;
  expiry: number;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const activeSessions = new Map<string, Session>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [token, session] of activeSessions) {
    if (now > session.expiry) activeSessions.delete(token);
  }
}

export function createSession(email: string, isAdmin: boolean, ttlMs: number = SESSION_TTL_MS): string {
  pruneExpired();
  const token = randomBytes(32).toString('hex');
  activeSessions.set(token, {
    email,
    isAdmin: Boolean(isAdmin),
    expiry: Date.now() + ttlMs,
  });
  return token;
}

export function getSession(token: string | undefined | null): Session | null {
  if (!token) return null;
  const session = activeSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiry) {
    activeSessions.delete(token);
    return null;
  }
  return session;
}

export function destroySession(token: string | undefined | null): void {
  if (token) activeSessions.delete(token);
}

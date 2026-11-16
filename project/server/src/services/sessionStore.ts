/**
 * Gemeinsamer Session-Store für Okta-OIDC (routes/oktaAuth.ts) und den
 * Break-Glass-Passwort-Login (routes/dashboard.ts).
 *
 * Stateless: das Token ist ein HMAC-signiertes Payload ({email, isAdmin, expiry}).
 * Dadurch überlebt die Session Deploys/Neustarts und der User muss sich nicht bei
 * jedem Neustart erneut per Okta anmelden. Schlüssel: SESSION_SECRET, sonst
 * abgeleitet aus OKTA_CLIENT_SECRET (stabil pro Umgebung), sonst prozess-lokal zufällig.
 * Logout widerruft Tokens prozess-lokal; das Cookie wird zusätzlich gelöscht.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

interface Session {
  email: string;
  isAdmin: boolean;
  expiry: number;
}

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (!cachedKey) {
    const explicit = (process.env.SESSION_SECRET || '').trim();
    const okta = (process.env.OKTA_CLIENT_SECRET || '').trim();
    cachedKey = explicit
      ? Buffer.from(explicit)
      : okta
        ? createHmac('sha256', okta).update('techstack-session-v1').digest()
        : randomBytes(32);
  }
  return cachedKey;
}

function sign(payload: string): string {
  return createHmac('sha256', key()).update(payload).digest('base64url');
}

const revoked = new Map<string, number>();

export function createSession(email: string, isAdmin: boolean, ttlMs: number = SESSION_TTL_MS): string {
  const payload = Buffer.from(
    JSON.stringify({ e: email, a: Boolean(isAdmin), x: Date.now() + ttlMs, n: randomBytes(8).toString('hex') }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function getSession(token: string | undefined | null): Session | null {
  if (!token || revoked.has(token)) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { e?: unknown; a?: unknown; x?: unknown };
    if (typeof d.e !== 'string' || typeof d.x !== 'number' || Date.now() > d.x) return null;
    return { email: d.e, isAdmin: d.a === true, expiry: d.x };
  } catch {
    return null;
  }
}

export function destroySession(token: string | undefined | null): void {
  const s = getSession(token);
  if (!token || !s) return;
  const now = Date.now();
  for (const [t, exp] of revoked) if (exp < now) revoked.delete(t);
  revoked.set(token, s.expiry);
}

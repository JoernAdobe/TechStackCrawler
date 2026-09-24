/**
 * Okta OIDC Authentication (server-seitiger Authorization Code Flow, Adobe Okta).
 *
 * Stellt bereit:
 *   GET  /auth/login            → 302 zu Okta /authorize (state + nonce)
 *   GET  /auth/callback         → Code-Exchange, id_token-Validierung, Session-Cookie
 *   GET  /auth/logout           → Session zerstören + Cookie löschen
 *   GET  /api/dashboard/session → { authenticated, email, isAdmin } (Client-Gate)
 *
 * Admin-Regel: E-Mail-Whitelist (config.adminEmails). Wer sich per Okta einloggt,
 * aber nicht in der Whitelist steht, bekommt eine Session mit isAdmin=false
 * (→ 403 in requireDashboardAuth / "nicht freigeschaltet" im Client).
 */
import { Router, type Request, type Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { randomBytes } from 'crypto';
import { config } from '../config.js';
import { createSession, getSession, destroySession } from '../services/sessionStore.js';
import { asyncHandler } from '../utils/http.js';

const SESSION_COOKIE = 'ts_session';
const DEFAULT_NEXT = '/#/dashboard';
const PENDING_TTL_MS = 10 * 60 * 1000; // 10 min

// --- abgeleitete Okta-Endpunkte (Adobe Org-Authorization-Server) ---------------
function oauthBase(): string {
  return `${config.okta.issuer}/oauth2`;
}
function authorizeUrl(): string {
  return `${oauthBase()}/v1/authorize`;
}
function tokenUrl(): string {
  return `${oauthBase()}/v1/token`;
}
function jwksUrl(): string {
  return `${oauthBase()}/v1/keys`;
}

function oidcConfigured(): boolean {
  return Boolean(config.okta.clientId && config.okta.clientSecret && config.okta.redirectUri);
}

function isProduction(): boolean {
  return config.nodeEnv === 'production';
}

function isAdminEmail(email: string): boolean {
  return config.adminEmails.includes(email.trim().toLowerCase());
}

// --- JWKS (lazy, gecacht durch jose's createRemoteJWKSet) -----------------------
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl()));
  }
  return jwks;
}

// --- transienter state→nonce/next Speicher (In-Memory, single worker) -----------
interface Pending {
  nonce: string;
  next: string;
  expiry: number;
}
const pendingAuth = new Map<string, Pending>();

/**
 * Harte Obergrenze gegen Speicherwachstum: Ohne Limit könnte ein Angreifer durch
 * massenhafte /auth/login-Aufrufe beliebig viele Einträge erzeugen.
 */
const MAX_PENDING_AUTH = 1000;

function rememberPending(state: string, nonce: string, next: string): void {
  const now = Date.now();
  for (const [k, v] of pendingAuth) {
    if (v.expiry < now) pendingAuth.delete(k);
  }
  while (pendingAuth.size >= MAX_PENDING_AUTH) {
    const oldest = pendingAuth.keys().next().value;
    if (oldest === undefined) break;
    pendingAuth.delete(oldest);
  }
  pendingAuth.set(state, { nonce, next, expiry: now + PENDING_TTL_MS });
}

function takePending(state: string): Pending | null {
  const entry = pendingAuth.get(state);
  if (!entry) return null;
  pendingAuth.delete(state);
  if (entry.expiry < Date.now()) return null;
  return entry;
}

/** Nur same-site absolute Pfade zulassen (Open-Redirect-Schutz). */
function safeNext(next: string | undefined): string {
  if (!next) return DEFAULT_NEXT;
  if (
    next.startsWith('/') &&
    !next.startsWith('//') &&
    !next.startsWith('/\\') &&
    !next.includes('\n') &&
    !next.includes('\r')
  ) {
    return next;
  }
  return DEFAULT_NEXT;
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });
}

async function exchangeCode(code: string): Promise<{ idToken: string; accessToken?: string }> {
  const basic = Buffer.from(`${config.okta.clientId}:${config.okta.clientSecret}`).toString('base64');
  const resp = await fetch(tokenUrl(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.okta.redirectUri,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.error('Okta token exchange failed:', resp.status, text.slice(0, 500));
    throw new Error('token_exchange_failed');
  }
  const payload = (await resp.json()) as { id_token?: string; access_token?: string };
  if (!payload.id_token) throw new Error('missing_id_token');
  return { idToken: payload.id_token, accessToken: payload.access_token };
}

async function fetchUserinfoEmail(accessToken: string): Promise<string> {
  try {
    const resp = await fetch(`${oauthBase()}/v1/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (resp.ok) {
      const info = (await resp.json()) as { email?: string };
      return (info.email || '').trim();
    }
  } catch {
    // ignore — Fallback greift
  }
  return '';
}

export function createAuthRoutes(): Router {
  const router = Router();

  router.get('/auth/login', (req: Request, res: Response) => {
    if (!oidcConfigured()) {
      res
        .status(503)
        .json({ error: 'Okta OIDC not configured.', code: 'service_unavailable' });
      return;
    }
    const next = safeNext(typeof req.query.next === 'string' ? req.query.next : undefined);
    const state = randomBytes(24).toString('hex');
    const nonce = randomBytes(24).toString('hex');
    rememberPending(state, nonce, next);
    const params = new URLSearchParams({
      client_id: config.okta.clientId,
      redirect_uri: config.okta.redirectUri,
      response_type: 'code',
      scope: config.okta.scopes,
      state,
      nonce,
    });
    res.redirect(302, `${authorizeUrl()}?${params.toString()}`);
  });

  router.get(
    '/auth/callback',
    asyncHandler(async (req: Request, res: Response) => {
    if (!oidcConfigured()) {
      res.status(503).json({ error: 'Okta OIDC not configured.', code: 'service_unavailable' });
      return;
    }

    const error = typeof req.query.error === 'string' ? req.query.error : undefined;
    if (error) {
      console.warn('Okta error:', error, req.query.error_description);
      // Nur eine feste Meldung ausgeben – der Query-Wert würde sonst als HTML reflektiert.
      res.status(401).type('text/plain').send('Okta login failed. Please try again or contact the administrator.');
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;

    // IdP-initiierter Start (Dashboard-Kachel) hat keinen code/state → Flow starten.
    if (!code && !state) {
      res.redirect(302, '/auth/login');
      return;
    }
    if (!code || !state) {
      res.status(400).send('Missing code or state');
      return;
    }

    const pending = takePending(state);
    if (!pending) {
      res.status(401).send('Invalid or expired OIDC state');
      return;
    }

    try {
      const { idToken, accessToken } = await exchangeCode(code);
      const { payload } = await jwtVerify(idToken, getJwks(), {
        issuer: config.okta.issuer,
        audience: config.okta.clientId,
      });
      if (pending.nonce && payload.nonce !== pending.nonce) {
        res.status(401).send('OIDC nonce mismatch');
        return;
      }

      let email = (typeof payload.email === 'string' ? payload.email : '').trim();
      if (!email && accessToken) {
        email = await fetchUserinfoEmail(accessToken);
      }
      if (!email) {
        const sub = typeof payload.sub === 'string' ? payload.sub : '';
        const preferred = typeof payload.preferred_username === 'string' ? payload.preferred_username : '';
        email = preferred || sub;
      }
      if (!email) {
        res.status(401).send('Could not determine user email from Okta');
        return;
      }

      const isAdmin = isAdminEmail(email);
      const token = createSession(email, isAdmin);
      setSessionCookie(res, token);
      console.log(`Okta login: ${email} (admin=${isAdmin})`);
      res.redirect(302, safeNext(pending.next));
    } catch (err) {
      console.error('Okta callback error:', err);
      res.status(502).send('Okta authentication failed');
    }
    }),
  );

  router.get('/auth/logout', (req: Request, res: Response) => {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    destroySession(cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ status: 'ok' });
  });

  // Client-Gate: sagt dem Frontend, ob eine gültige (Cookie-)Session besteht.
  router.get('/api/dashboard/session', (req: Request, res: Response) => {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    const session = getSession(cookies?.[SESSION_COOKIE]);
    if (!session) {
      res.json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, email: session.email, isAdmin: session.isAdmin });
  });

  return router;
}

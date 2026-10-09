import { createHash } from 'crypto';
import { config } from '../config.js';

export interface ImsIdentity {
  email: string;
  userId: string | null;
  clientId: string | null;
}

interface CacheEntry {
  identity: ImsIdentity;
  expiresAt: number;
}

type FetchFn = typeof fetch;

const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 1_000;
const USERINFO_TIMEOUT_MS = 5_000;
const cache = new Map<string, CacheEntry>();

function cacheKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Liest den (noch unverifizierten) JWT-Payload nur zur Vorfilterung; Vertrauen entsteht erst durch IMS. */
function decodePayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json);
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function tokenExpiry(payload: Record<string, unknown>): number | null {
  const created = Number(payload.created_at);
  const expiresIn = Number(payload.expires_in);
  if (Number.isFinite(created) && Number.isFinite(expiresIn)) return created + expiresIn;
  const exp = Number(payload.exp);
  return Number.isFinite(exp) ? exp * 1000 : null;
}

function emailAllowed(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return !!domain && config.ims.allowedEmailDomains.includes(domain);
}

export function clearImsCache(): void {
  cache.clear();
}

/**
 * Validiert einen von Coworker per IMS-Passthrough weitergereichten User-Access-Token
 * über den IMS-userinfo-Endpoint und beschränkt den Zugriff auf erlaubte E-Mail-Domains.
 */
export async function validateImsToken(
  token: string,
  fetchFn: FetchFn = fetch,
  now: number = Date.now(),
): Promise<ImsIdentity | null> {
  const payload = decodePayload(token);
  if (!payload || payload.type !== 'access_token') return null;

  const expiry = tokenExpiry(payload);
  if (expiry !== null && expiry <= now) return null;

  const clientId = typeof payload.client_id === 'string' ? payload.client_id : null;
  if (config.ims.allowedClientIds.length > 0 && (!clientId || !config.ims.allowedClientIds.includes(clientId))) {
    return null;
  }

  const key = cacheKey(token);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.identity;
  if (cached) cache.delete(key);

  let res: Response;
  try {
    res = await fetchFn(`${config.ims.baseUrl}/ims/userinfo/v2`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(USERINFO_TIMEOUT_MS),
    });
  } catch (err) {
    console.warn('[ims] userinfo request failed:', err instanceof Error ? err.message : err);
    return null;
  }
  if (!res.ok) {
    console.warn(`[ims] userinfo rejected token (HTTP ${res.status})`);
    return null;
  }

  let info: Record<string, unknown>;
  try {
    info = (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }

  const email = typeof info.email === 'string' ? info.email.trim().toLowerCase() : '';
  if (!email || info.email_verified === false || !emailAllowed(email)) {
    console.warn('[ims] token rejected: email missing, unverified or outside allowed domains');
    return null;
  }

  const identity: ImsIdentity = {
    email,
    userId: typeof info.sub === 'string' ? info.sub : null,
    clientId,
  };

  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { identity, expiresAt: Math.min(now + CACHE_TTL_MS, expiry ?? Infinity) });
  return identity;
}

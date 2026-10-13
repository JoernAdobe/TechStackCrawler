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

/**
 * Wählt anhand des Claims `as` (z. B. "ims-na1" oder "ims-na1-stg1") die ausstellende IMS-Instanz,
 * aber nur, wenn sie konfiguriert ist. Ohne `as` gilt die erste konfigurierte Instanz.
 */
function imsBaseUrlFor(payload: Record<string, unknown>): string | null {
  const urls = config.ims.baseUrls;
  if (typeof payload.as !== 'string' || !payload.as) return urls[0] ?? null;
  const host = `${payload.as.toLowerCase()}.adobelogin.com`;
  return urls.find((u) => URL.canParse(u) && new URL(u).hostname === host) ?? null;
}

async function fetchImsJson(
  fetchFn: FetchFn,
  url: string,
  token: string,
  label: string,
): Promise<Record<string, unknown> | null> {
  let res: Response;
  try {
    res = await fetchFn(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(USERINFO_TIMEOUT_MS),
    });
  } catch (err) {
    console.warn(`[ims] ${label} request failed:`, err instanceof Error ? err.message : err);
    return null;
  }
  if (!res.ok) {
    console.warn(`[ims] ${label} rejected token (HTTP ${res.status}, ${url})`);
    return null;
  }
  try {
    const body = await res.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
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

  const baseUrl = imsBaseUrlFor(payload);
  if (!baseUrl) {
    console.warn(`[ims] token rejected: issuing IMS "${String(payload.as)}" not allowed`);
    return null;
  }

  const info = await fetchImsJson(fetchFn, `${baseUrl}/ims/userinfo/v2`, token, 'userinfo');
  if (!info) return null;

  let email = typeof info.email === 'string' ? info.email.trim().toLowerCase() : '';
  let verified = info.email_verified !== false;
  let userId = typeof info.sub === 'string' ? info.sub : null;
  let profileKeys = '-';

  // Coworker reicht exc_app-Tokens ohne Scope "email" durch; userinfo liefert dann nur "sub".
  // Mit Scope "AdobeID" gibt das IMS-Profil die E-Mail trotzdem heraus.
  if (!email) {
    const profile = await fetchImsJson(fetchFn, `${baseUrl}/ims/profile/v1`, token, 'profile');
    if (profile) {
      profileKeys = Object.keys(profile).sort().join(',');
      email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : '';
      verified = profile.emailVerified !== false && profile.emailVerified !== 'false';
      if (!userId && typeof profile.userId === 'string') userId = profile.userId;
    }
  }

  if (!email || !verified || !emailAllowed(email)) {
    const reason = !email ? 'email missing' : !verified ? 'email unverified' : 'domain not allowed';
    const domain = email.split('@')[1] ?? '-';
    const scope = typeof payload.scope === 'string' ? payload.scope : '-';
    console.warn(
      `[ims] token rejected: ${reason} (domain=${domain}, as=${String(payload.as ?? '-')}, ` +
        `client_id=${clientId ?? '-'}, scope=${scope}, userinfo_keys=${Object.keys(info).sort().join(',')}, ` +
        `profile_keys=${profileKeys})`,
    );
    return null;
  }

  const identity: ImsIdentity = {
    email,
    userId,
    clientId,
  };

  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { identity, expiresAt: Math.min(now + CACHE_TTL_MS, expiry ?? Infinity) });
  return identity;
}

import type { Request, Response, NextFunction } from 'express';
import { getPool } from '../db/index.js';
import { validateApiToken } from '../db/apiTokens.js';
import { DbUnavailableError, UnauthorizedError } from '../utils/http.js';
import { config } from '../config.js';
import { validateImsToken } from './imsAuth.js';

const API_TOKEN_PREFIX = 'tsa_';

function clientInfo(req: Request): string {
  const ua = String(req.headers['user-agent'] ?? '-').slice(0, 120);
  return `${req.method} ip=${req.ip ?? '-'} ua="${ua}"`;
}

/** Protokolliert abgelehnte /mcp-Zugriffe (ohne Token-Inhalt), damit Client-Probleme diagnostizierbar sind. */
function reject(req: Request, reason: string, message = 'Invalid or expired token'): never {
  console.warn(`[mcp-auth] rejected (${reason}) ${clientInfo(req)}`);
  throw new UnauthorizedError(message);
}

/** Akzeptiert app-eigene API-Tokens (`tsa_…`) oder per Coworker-Passthrough weitergereichte IMS-User-Tokens. */
export async function requireMcpAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    reject(req, auth ? 'non-bearer authorization' : 'no authorization header', 'Missing or invalid Authorization header');
  }

  const token = auth.slice(7);
  if (!token) {
    reject(req, 'empty bearer', 'Empty bearer token');
  }

  if (!token.startsWith(API_TOKEN_PREFIX)) {
    if (!config.ims.enabled) {
      reject(req, 'ims auth disabled');
    }
    const identity = await validateImsToken(token);
    if (!identity) {
      reject(req, 'ims token invalid');
    }
    res.locals.mcpUser = identity.email;
    console.info(`[mcp-auth] ims ok user=${identity.email} client=${identity.clientId ?? '-'} ${clientInfo(req)}`);
    next();
    return;
  }

  const db = getPool();
  if (!db) {
    throw new DbUnavailableError();
  }

  const valid = await validateApiToken(db, token);
  if (!valid) {
    reject(req, 'api token invalid');
  }

  next();
}

import type { Request, Response, NextFunction } from 'express';
import { getPool } from '../db/index.js';
import { validateApiToken } from '../db/apiTokens.js';
import { DbUnavailableError, UnauthorizedError } from '../utils/http.js';
import { config } from '../config.js';
import { validateImsToken } from './imsAuth.js';

const API_TOKEN_PREFIX = 'tsa_';

/** Akzeptiert app-eigene API-Tokens (`tsa_…`) oder per Coworker-Passthrough weitergereichte IMS-User-Tokens. */
export async function requireMcpAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header');
  }

  const token = auth.slice(7);
  if (!token) {
    throw new UnauthorizedError('Empty bearer token');
  }

  if (!token.startsWith(API_TOKEN_PREFIX)) {
    if (!config.ims.enabled) {
      throw new UnauthorizedError('Invalid or expired token');
    }
    const identity = await validateImsToken(token);
    if (!identity) {
      throw new UnauthorizedError('Invalid or expired token');
    }
    res.locals.mcpUser = identity.email;
    next();
    return;
  }

  const db = getPool();
  if (!db) {
    throw new DbUnavailableError();
  }

  const valid = await validateApiToken(db, token);
  if (!valid) {
    throw new UnauthorizedError('Invalid or expired token');
  }

  next();
}

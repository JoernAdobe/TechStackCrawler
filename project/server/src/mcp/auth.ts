import type { Request, Response, NextFunction } from 'express';
import { getPool } from '../db/index.js';
import { validateApiToken } from '../db/apiTokens.js';
import { DbUnavailableError, UnauthorizedError } from '../utils/http.js';

export async function requireMcpAuth(req: Request, _res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header');
  }

  const token = auth.slice(7);
  if (!token) {
    throw new UnauthorizedError('Empty bearer token');
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

import type { Request, Response, NextFunction } from 'express';
import { getPool } from '../db/index.js';
import { validateApiToken } from '../db/apiTokens.js';

export async function requireMcpAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = auth.slice(7);
  if (!token) {
    res.status(401).json({ error: 'Empty bearer token' });
    return;
  }

  const db = getPool();
  if (!db) {
    res.status(503).json({ error: 'Database not available' });
    return;
  }

  const valid = await validateApiToken(db, token);
  if (!valid) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  next();
}

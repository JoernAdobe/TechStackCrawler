import type { Request, Response } from 'express';
import { getPool } from '../db/index.js';
import { createApiToken, listApiTokens, revokeApiToken } from '../db/apiTokens.js';

export async function createTokenRoute(req: Request, res: Response) {
  const { name, expiresAt } = req.body ?? {};
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Token name is required' });
    return;
  }

  const pool = getPool();
  if (!pool) {
    res.status(503).json({ error: 'Database not available' });
    return;
  }

  try {
    const { id, token } = await createApiToken(pool, name.trim(), expiresAt ?? null);
    res.json({ id, name: name.trim(), token });
  } catch (err) {
    console.error('Create token error:', err);
    res.status(500).json({ error: 'Failed to create token' });
  }
}

export async function listTokensRoute(_req: Request, res: Response) {
  const pool = getPool();
  if (!pool) {
    res.json([]);
    return;
  }

  try {
    const tokens = await listApiTokens(pool);
    res.json(tokens);
  } catch (err) {
    console.error('List tokens error:', err);
    res.status(500).json({ error: 'Failed to list tokens' });
  }
}

export async function revokeTokenRoute(req: Request, res: Response) {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(idParam || '', 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid token ID' });
    return;
  }

  const pool = getPool();
  if (!pool) {
    res.status(503).json({ error: 'Database not available' });
    return;
  }

  try {
    await revokeApiToken(pool, id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Revoke token error:', err);
    res.status(500).json({ error: 'Failed to revoke token' });
  }
}

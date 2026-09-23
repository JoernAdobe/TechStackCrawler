import type { Request, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../db/index.js';
import { createApiToken, listApiTokens, revokeApiToken } from '../db/apiTokens.js';
import { DbUnavailableError, parseBody, parseParams } from '../utils/http.js';

const createTokenSchema = z.object({
  name: z.string().trim().min(1, 'Token name is required').max(200),
  /**
   * Ablaufdatum als `YYYY-MM-DD` (Date-Input des Dashboards) oder vollständiger
   * ISO-Zeitstempel. Leer/null = unbegrenzt gültig.
   */
  expiresAt: z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), 'expiresAt must be a valid date')
    .refine((v) => new Date(v).getTime() > Date.now(), 'expiresAt must be in the future')
    .nullish()
    .or(z.literal('').transform(() => null)),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export async function createTokenRoute(req: Request, res: Response) {
  const { name, expiresAt } = parseBody(createTokenSchema, req.body);

  const pool = getPool();
  if (!pool) {
    throw new DbUnavailableError();
  }

  const { id, token } = await createApiToken(pool, name, expiresAt ?? null);
  res.json({ id, name, token });
}

/**
 * Listet vorhandene Tokens. Ohne DB wird bewusst eine leere Liste geliefert,
 * damit das Dashboard auch ohne laufende MariaDB bedienbar bleibt.
 */
export async function listTokensRoute(_req: Request, res: Response) {
  const pool = getPool();
  if (!pool) {
    res.json([]);
    return;
  }

  const tokens = await listApiTokens(pool);
  res.json(tokens);
}

export async function revokeTokenRoute(req: Request, res: Response) {
  const { id } = parseParams(idParamSchema, req.params);

  const pool = getPool();
  if (!pool) {
    throw new DbUnavailableError();
  }

  await revokeApiToken(pool, id);
  res.json({ ok: true });
}
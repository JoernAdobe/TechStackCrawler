import { createHash, randomBytes } from 'crypto';
import type { DbHandle } from './types.js';

export interface ApiTokenRow {
  id: number;
  name: string;
  token_hash: string;
  created_at: string | Date;
  expires_at: string | Date | null;
  last_used_at: string | Date | null;
  is_active: number;
}

export interface ApiTokenInfo {
  id: number;
  name: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  isActive: boolean;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toIso(val: string | Date | null): string | null {
  if (!val) return null;
  return typeof val === 'string' ? val : val.toISOString();
}

export async function createApiToken(
  db: DbHandle,
  name: string,
  expiresAt?: string | null,
): Promise<{ id: number; token: string }> {
  const token = `tsa_${randomBytes(32).toString('hex')}`;
  const hash = hashToken(token);

  if (db.dialect === 'sqlite') {
    const { insertId } = await db.execute(
      `INSERT INTO api_tokens (name, token_hash, expires_at) VALUES (?, ?, ?)`,
      [name, hash, expiresAt ?? null],
    );
    return { id: insertId ?? 0, token };
  }

  const expiresVal = expiresAt
    ? new Date(expiresAt).toISOString().slice(0, 19).replace('T', ' ')
    : null;
  const { insertId } = await db.execute(
    `INSERT INTO api_tokens (name, token_hash, expires_at) VALUES (?, ?, ?)`,
    [name, hash, expiresVal],
  );
  return { id: insertId ?? 0, token };
}

export async function validateApiToken(
  db: DbHandle,
  token: string,
): Promise<boolean> {
  const hash = hashToken(token);
  const { rows } = await db.execute(
    `SELECT id, expires_at, is_active FROM api_tokens WHERE token_hash = ?`,
    [hash],
  );
  const row = (Array.isArray(rows) ? rows[0] : null) as Pick<ApiTokenRow, 'id' | 'expires_at' | 'is_active'> | null;
  if (!row || !row.is_active) return false;

  if (row.expires_at) {
    const exp = new Date(row.expires_at);
    if (Date.now() > exp.getTime()) return false;
  }

  const now = db.dialect === 'sqlite'
    ? new Date().toISOString()
    : new Date().toISOString().slice(0, 19).replace('T', ' ');
  await db.execute(
    `UPDATE api_tokens SET last_used_at = ? WHERE id = ?`,
    [now, row.id],
  ).catch(() => {});

  return true;
}

export async function listApiTokens(db: DbHandle): Promise<ApiTokenInfo[]> {
  const { rows } = await db.execute(
    `SELECT id, name, created_at, expires_at, last_used_at, is_active
     FROM api_tokens ORDER BY created_at DESC`,
  );
  return (Array.isArray(rows) ? rows : []).map((r) => {
    const row = r as ApiTokenRow;
    return {
      id: row.id,
      name: row.name,
      createdAt: toIso(row.created_at) ?? '',
      expiresAt: toIso(row.expires_at),
      lastUsedAt: toIso(row.last_used_at),
      isActive: !!row.is_active,
    };
  });
}

export async function revokeApiToken(db: DbHandle, id: number): Promise<boolean> {
  await db.execute(`UPDATE api_tokens SET is_active = 0 WHERE id = ?`, [id]);
  return true;
}

import type { DbHandle } from './types.js';

/** In der Admin-UI gepflegter Admin (zusätzlich zu den fixen Admins aus config.adminEmails). */
export interface AdminRow {
  email: string;
  added_by: string;
  added_at_ms: number;
}

export async function initAdminsTable(p: DbHandle): Promise<void> {
  await p.execute(`
    CREATE TABLE IF NOT EXISTS admins (
      email VARCHAR(320) NOT NULL PRIMARY KEY,
      added_by VARCHAR(320) NOT NULL,
      added_at_ms BIGINT NOT NULL
    )
  `);
}

export async function listAdminRows(db: DbHandle): Promise<AdminRow[]> {
  const { rows } = await db.execute(`SELECT email, added_by, added_at_ms FROM admins ORDER BY email ASC`);
  return (rows as Array<Record<string, unknown>>).map((r) => ({
    email: String(r.email),
    added_by: String(r.added_by),
    added_at_ms: Number(r.added_at_ms),
  }));
}

/** Legt einen Admin an; false, wenn er schon existiert. */
export async function insertAdmin(db: DbHandle, email: string, addedBy: string, now = Date.now()): Promise<boolean> {
  const verb = db.dialect === 'sqlite' ? 'INSERT OR IGNORE' : 'INSERT IGNORE';
  const { affectedRows } = await db.execute(`${verb} INTO admins (email, added_by, added_at_ms) VALUES (?, ?, ?)`, [
    email,
    addedBy,
    now,
  ]);
  return Number(affectedRows ?? 0) > 0;
}

export async function deleteAdmin(db: DbHandle, email: string): Promise<boolean> {
  const { affectedRows } = await db.execute(`DELETE FROM admins WHERE email = ?`, [email]);
  return Number(affectedRows ?? 0) > 0;
}

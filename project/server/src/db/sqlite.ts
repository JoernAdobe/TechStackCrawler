import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import type { DbHandle } from './types.js';

let db: Database.Database | null = null;

export function getSqliteDb(path: string): Database.Database {
  if (db) return db;
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  db = new Database(path);
  db.pragma('journal_mode = WAL');
  return db;
}

export function createSqliteHandle(dbPath: string): DbHandle {
  const database = getSqliteDb(dbPath);
  return {
    dialect: 'sqlite',
    async execute(sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; insertId?: number }> {
      const stmt = database.prepare(sql);
      const upper = sql.trim().toUpperCase();
      if (upper.startsWith('SELECT') || upper.startsWith('WITH')) {
        const rows = stmt.all(...params);
        return { rows: rows as unknown[] };
      }
      const result = stmt.run(...params);
      return { rows: [], insertId: Number((result as { lastInsertRowid: bigint }).lastInsertRowid) };
    },
    async close() {
      database.close();
    },
  };
}

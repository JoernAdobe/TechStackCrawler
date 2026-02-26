import { config } from '../config.js';
import type { DbHandle } from './types.js';
import { createSqliteHandle } from './sqlite.js';
import { createMysqlHandle } from './mysql.js';

let db: DbHandle | null = null;

export function getPool(): DbHandle | null {
  if (db) return db;

  const useSqlite = config.database.useSqlite;
  const dbPath = config.database.sqlitePath;

  if (useSqlite) {
    db = createSqliteHandle(dbPath);
    return db;
  }

  if (config.database.password) {
    db = createMysqlHandle({
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database,
    });
    return db;
  }

  return null;
}

export async function initDb(): Promise<void> {
  const p = getPool();
  if (!p) return;

  try {
    if (p.dialect === 'sqlite') {
      await p.execute(`
        CREATE TABLE IF NOT EXISTS analyses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT NOT NULL,
          result_json TEXT NOT NULL,
          analyzed_at TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      await p.execute(`CREATE INDEX IF NOT EXISTS idx_analyses_analyzed_at ON analyses(analyzed_at)`);
      await p.execute(`CREATE INDEX IF NOT EXISTS idx_analyses_url ON analyses(url)`);

      await p.execute(`
        CREATE TABLE IF NOT EXISTS audio_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          text_hash TEXT NOT NULL UNIQUE,
          audio_data BLOB NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      await p.execute(`CREATE INDEX IF NOT EXISTS idx_audio_cache_text_hash ON audio_cache(text_hash)`);
    } else {
      await p.execute(`
        CREATE TABLE IF NOT EXISTS analyses (
          id INT AUTO_INCREMENT PRIMARY KEY,
          url VARCHAR(2048) NOT NULL,
          result_json LONGTEXT NOT NULL,
          analyzed_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_analyzed_at (analyzed_at),
          INDEX idx_url (url(255))
        )
      `);
      await p.execute(`
        CREATE TABLE IF NOT EXISTS audio_cache (
          id INT AUTO_INCREMENT PRIMARY KEY,
          text_hash CHAR(64) NOT NULL UNIQUE,
          audio_data LONGBLOB NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_text_hash (text_hash)
        )
      `);
    }
  } catch (err) {
    console.error('DB init error:', err);
  }
}

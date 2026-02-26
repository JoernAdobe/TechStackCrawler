import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { config } from '../config.js';
import type { DbHandle } from './types.js';
import { createMysqlHandle } from './mysql.js';
import { toMysqlDatetime } from './analyses.js';

let db: DbHandle | null = null;

export function getPool(): DbHandle | null {
  if (db) return db;

  const useSqlite = config.database.useSqlite;
  const dbPath = config.database.sqlitePath;

  if (useSqlite) {
    return db; // Wird von initDb gesetzt (dynamischer Import)
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
  const useSqlite = config.database.useSqlite;
  const dbPath = config.database.sqlitePath;

  if (useSqlite) {
    const { createSqliteHandle } = await import('./sqlite.js');
    db = createSqliteHandle(dbPath);
  }

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
      try {
        await p.execute(
          `ALTER TABLE analyses ADD COLUMN IF NOT EXISTS created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
        );
      } catch {
        // MariaDB < 10.5 oder MySQL – Spalte existiert evtl. bereits
      }
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

    // Migration: Lokale SQLite-Exporte in MariaDB importieren (falls DB leer)
    if (p.dialect === 'mysql') {
      const exportPath = path.join(process.cwd(), 'techstack_local_export.json');
      if (existsSync(exportPath)) {
        const { rows } = await p.execute('SELECT COUNT(*) as c FROM analyses');
        const count = (rows[0] as { c: number })?.c ?? 0;
        if (count === 0) {
          const data = JSON.parse(readFileSync(exportPath, 'utf8')) as Array<{
            url: string;
            result_json: string;
            analyzed_at?: string;
            created_at?: string;
          }>;
          for (const r of data) {
            const analyzedAt = toMysqlDatetime(r.analyzed_at || r.created_at || new Date().toISOString());
            await p.execute(
              'INSERT INTO analyses (url, result_json, analyzed_at) VALUES (?, ?, ?)',
              [r.url, r.result_json, analyzedAt],
            );
          }
          console.log(`Migration: ${data.length} Analysen aus techstack_local_export.json importiert`);
        }
      }
    }
  } catch (err) {
    console.error('DB init error:', err);
  }
}

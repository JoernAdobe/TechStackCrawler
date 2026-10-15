/**
 * Zusätzliche Tabellen für die EAA-Parität (Batch-/Account-Assessments, Feedback).
 * Rein additiv – bestehende Tabellen bleiben unverändert.
 */
import type { DbHandle } from './types.js';

export async function initParityTables(p: DbHandle): Promise<void> {
  if (p.dialect === 'sqlite') {
    await p.execute(`
      CREATE TABLE IF NOT EXISTS batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await p.execute(`
      CREATE TABLE IF NOT EXISTS batch_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        url TEXT NOT NULL,
        label TEXT,
        status TEXT NOT NULL,
        analysis_id INTEGER,
        error TEXT,
        detections_json TEXT,
        started_at TEXT,
        finished_at TEXT
      )
    `);
    await p.execute(`CREATE INDEX IF NOT EXISTS idx_batch_items_batch ON batch_items(batch_id)`);
    await p.execute(`
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        analysis_id INTEGER,
        batch_id INTEGER,
        type TEXT NOT NULL,
        rating INTEGER,
        title TEXT,
        description TEXT NOT NULL,
        payload_json TEXT,
        created_by TEXT,
        status TEXT DEFAULT 'open',
        created_at TEXT NOT NULL
      )
    `);
    await addBatchItemEnrichmentsColumn(p);
    return;
  }

  await p.execute(`
    CREATE TABLE IF NOT EXISTS batches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      kind VARCHAR(16) NOT NULL,
      title VARCHAR(255) NOT NULL,
      status VARCHAR(32) NOT NULL,
      meta_json LONGTEXT NOT NULL,
      created_by VARCHAR(255),
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `);
  await p.execute(`
    CREATE TABLE IF NOT EXISTS batch_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      batch_id INT NOT NULL,
      position INT NOT NULL,
      url VARCHAR(2048) NOT NULL,
      label VARCHAR(255),
      status VARCHAR(16) NOT NULL,
      analysis_id INT,
      error TEXT,
      detections_json LONGTEXT,
      started_at DATETIME,
      finished_at DATETIME,
      INDEX idx_batch_items_batch (batch_id)
    )
  `);
  await p.execute(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INT AUTO_INCREMENT PRIMARY KEY,
      analysis_id INT,
      batch_id INT,
      type VARCHAR(64) NOT NULL,
      rating TINYINT,
      title VARCHAR(255),
      description TEXT NOT NULL,
      payload_json LONGTEXT,
      created_by VARCHAR(255),
      status VARCHAR(16) DEFAULT 'open',
      created_at DATETIME NOT NULL
    )
  `);
  await addBatchItemEnrichmentsColumn(p);
}

/** Additive Migration: kompakte Enrichments pro Batch-Item (Traffic, Lighthouse, ObservePoint …). */
async function addBatchItemEnrichmentsColumn(p: DbHandle): Promise<void> {
  const { rows } =
    p.dialect === 'sqlite'
      ? await p.execute(`SELECT name FROM pragma_table_info('batch_items') WHERE name = 'enrichments_json'`)
      : await p.execute(
          `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'batch_items' AND COLUMN_NAME = 'enrichments_json'`,
        );
  if (rows.length > 0) return;
  await p.execute(
    `ALTER TABLE batch_items ADD COLUMN enrichments_json ${p.dialect === 'sqlite' ? 'TEXT' : 'LONGTEXT'}`,
  );
}

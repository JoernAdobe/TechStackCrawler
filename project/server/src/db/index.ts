import mysql from 'mysql2/promise';
import { config } from '../config.js';

let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool | null {
  if (!config.database.password) {
    if (config.nodeEnv === 'production') {
      console.warn('DB_PASSWORD not set – database disabled');
    }
    return null;
  }
  if (!pool) {
    pool = mysql.createPool({
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

export async function initDb(): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    const conn = await p.getConnection();
    await conn.query(`
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
    await conn.query(`
      CREATE TABLE IF NOT EXISTS audio_cache (
        id INT AUTO_INCREMENT PRIMARY KEY,
        text_hash CHAR(64) NOT NULL UNIQUE,
        audio_data LONGBLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_text_hash (text_hash)
      )
    `);
    conn.release();
  } catch (err) {
    console.error('DB init error:', err);
  }
}

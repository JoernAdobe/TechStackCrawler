import mysql from 'mysql2/promise';
import type { DbHandle } from './types.js';

export function createMysqlHandle(config: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}): DbHandle {
  const pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  return {
    dialect: 'mysql',
    async execute(sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; insertId?: number }> {
      const [result] = await pool.execute(sql, params as (string | number | Buffer | null)[]);
      const rows = Array.isArray(result) ? result : [];
      const insertId = (result as { insertId?: number })?.insertId;
      return { rows, insertId };
    },
  };
}

/** Einheitliche DB-Schnittstelle für SQLite und MySQL */
export interface DbHandle {
  execute(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; insertId?: number; affectedRows?: number }>;
  close?(): Promise<void>;
  dialect: 'sqlite' | 'mysql';
}

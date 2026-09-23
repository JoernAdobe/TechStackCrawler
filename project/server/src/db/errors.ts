/**
 * Zentrale Erkennung von DB-Fehlerklassen. Vorher war diese Logik in mehreren
 * Routen dupliziert (analyses.ts, dashboard.ts) und dabei leicht unterschiedlich.
 */

type DbError = NodeJS.ErrnoException & { code?: string; errno?: number };

const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'PROTOCOL_CONNECTION_LOST',
]);

const CONNECTION_ERROR_PATTERN = /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND/i;

/** True, wenn der Fehler auf eine nicht erreichbare Datenbank hindeutet. */
export function isDbUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as DbError;
  if (err.code && CONNECTION_ERROR_CODES.has(err.code)) return true;
  return typeof err.message === 'string' && CONNECTION_ERROR_PATTERN.test(err.message);
}

/**
 * True bei unbekannter Spalte/Tabelle — typischerweise ein veraltetes Schema,
 * das noch migriert werden muss (MySQL ER_BAD_FIELD_ERROR = 1054, ER_NO_SUCH_TABLE = 1146).
 */
export function isSchemaOutdatedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as DbError;
  if (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE') return true;
  if (err.errno === 1054 || err.errno === 1146) return true;
  return typeof err.message === 'string' && /no such (column|table)/i.test(err.message);
}

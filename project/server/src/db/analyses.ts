import type { DbHandle } from './types.js';
import type { AnalysisResult } from '../types/analysis.js';

export function toMysqlDatetime(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export async function saveAnalysis(
  db: DbHandle,
  result: AnalysisResult,
): Promise<number> {
  const analyzedAt = toMysqlDatetime(result.analyzedAt);
  const { insertId } = await db.execute(
    `INSERT INTO analyses (url, result_json, analyzed_at) VALUES (?, ?, ?)`,
    [result.url, JSON.stringify(result), analyzedAt],
  );
  return insertId ?? 0;
}

export interface AnalysisRow {
  id: number;
  url: string;
  result_json: string;
  analyzed_at: Date | string;
  created_at: Date | string;
}

export async function listAnalyses(
  db: DbHandle,
  limit = 50,
): Promise<AnalysisRow[]> {
  const limitNum = Math.min(Math.max(1, Math.floor(limit)), 100);
  try {
    const { rows } = await db.execute(
      `SELECT id, url, result_json, analyzed_at, created_at 
       FROM analyses 
       ORDER BY analyzed_at DESC 
       LIMIT ?`,
      [limitNum],
    );
    return (Array.isArray(rows) ? rows : []) as AnalysisRow[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('created_at') || msg.includes('Unknown column')) {
      const { rows } = await db.execute(
        `SELECT id, url, result_json, analyzed_at, analyzed_at as created_at 
         FROM analyses 
         ORDER BY analyzed_at DESC 
         LIMIT ?`,
        [limitNum],
      );
      return (Array.isArray(rows) ? rows : []) as AnalysisRow[];
    }
    throw err;
  }
}

const asString = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/**
 * Ältere/teilweise gespeicherte Analysen defensiv auf die aktuelle Form bringen, damit
 * Client-Komponenten (`categories.map`, `rawDetections.length` …) nicht crashen.
 */
export function normalizeAnalysisResult(raw: unknown, row?: Pick<AnalysisRow, 'url' | 'analyzed_at'>): AnalysisResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const analyzedAt = row?.analyzed_at instanceof Date ? row.analyzed_at.toISOString() : asString(row?.analyzed_at);
  return {
    ...(r as unknown as AnalysisResult),
    url: asString(r.url, row?.url ?? ''),
    analyzedAt: asString(r.analyzedAt, analyzedAt),
    summary: asString(r.summary),
    categories: asArray<Record<string, unknown>>(r.categories)
      .filter((c) => c && typeof c === 'object')
      .map((c) => ({
        ...c,
        category: asString(c.category),
        currentTechnology: asString(c.currentTechnology),
        challengesAndPainPoints: asString(c.challengesAndPainPoints),
        adobeOpportunity: asString(c.adobeOpportunity),
      })),
    rawDetections: asArray<Record<string, unknown>>(r.rawDetections)
      .filter((d) => d && typeof d === 'object' && typeof d.name === 'string')
      .map((d) => ({
        ...(d as unknown as AnalysisResult['rawDetections'][number]),
        categories: asArray<string>(d.categories).filter((c) => typeof c === 'string'),
        confidence: typeof d.confidence === 'number' ? d.confidence : 0,
      })),
    ...(r.scanWarnings !== undefined ? { scanWarnings: asArray(r.scanWarnings) } : {}),
  };
}

export async function getAnalysisById(
  db: DbHandle,
  id: number,
): Promise<AnalysisResult | null> {
  const { rows } = await db.execute(
    `SELECT id, url, result_json, analyzed_at, created_at 
     FROM analyses WHERE id = ?`,
    [id],
  );
  const row = (Array.isArray(rows) ? rows[0] : null) as AnalysisRow | null;
  if (!row) return null;
  try {
    const result = normalizeAnalysisResult(JSON.parse(row.result_json), row);
    result.id = row.id;
    return result;
  } catch {
    console.error(`Corrupt JSON in analysis id=${row.id}`);
    return null;
  }
}

export async function updateAnalysis(
  db: DbHandle,
  id: number,
  updates: Partial<Pick<AnalysisResult, 'useCaseDiscovery' | 'sitemapUrls' | 'enrichments'>>,
): Promise<boolean> {
  const current = await getAnalysisById(db, id);
  if (!current) return false;
  const { id: _omit, ...rest } = current;
  const merged = { ...rest, ...updates };
  await db.execute(`UPDATE analyses SET result_json = ? WHERE id = ?`, [
    JSON.stringify(merged),
    id,
  ]);
  return true;
}

export interface LibrarySourceRow {
  id: number;
  url: string;
  analyzedAt: string;
  briefingJson: string | null;
}

const LIBRARY_MAX_ROWS = 5000;

/** SQLite liefert „YYYY-MM-DD HH:MM:SS“ (UTC, ohne Zone), MySQL ein Date-Objekt → ISO. */
export function toIsoTimestamp(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) return `${value.replace(' ', 'T')}Z`;
  return value;
}

/**
 * Schlanke Liste aller Analysen für die Library: nur Metadaten plus die kompakte
 * Briefing-Zusammenfassung (per JSON_EXTRACT, ohne das ganze result_json zu laden).
 */
export async function listLibraryRows(db: DbHandle): Promise<LibrarySourceRow[]> {
  const { rows } = await db.execute(
    `SELECT id, url, analyzed_at,
            CASE WHEN JSON_VALID(result_json) THEN JSON_EXTRACT(result_json, '$.enrichments.briefing') END AS briefing_json
     FROM analyses
     ORDER BY analyzed_at DESC
     LIMIT ?`,
    [LIBRARY_MAX_ROWS],
  );
  return (Array.isArray(rows) ? rows : []).map((r) => {
    const row = r as { id: number; url: string; analyzed_at: Date | string; briefing_json: unknown };
    return {
      id: Number(row.id),
      url: row.url,
      analyzedAt: toIsoTimestamp(row.analyzed_at),
      briefingJson: typeof row.briefing_json === 'string' ? row.briefing_json : null,
    };
  });
}

/** Firmenname je Analyse aus dem jeweils neuesten Briefing-Job (falls vorhanden). */
export async function listBriefingCompanyNames(db: DbHandle): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  try {
    const { rows } = await db.execute(
      `SELECT analysis_id, company_name FROM briefing_jobs
       WHERE company_name IS NOT NULL AND company_name <> ''
       ORDER BY id DESC`,
    );
    for (const r of Array.isArray(rows) ? rows : []) {
      const row = r as { analysis_id: number; company_name: string };
      const id = Number(row.analysis_id);
      if (!names.has(id)) names.set(id, row.company_name);
    }
  } catch {
    // briefing_jobs fehlt (ältere DB) → Domain bleibt der Anzeigename.
  }
  return names;
}

/**
 * Stack-History / Delta (EAA "Multi-Year View"): alle gespeicherten Analysen desselben
 * Hostnamens (www. ignoriert) chronologisch, inkl. Diff aktuelle vs. vorherige Analyse.
 */
import type { DbHandle } from '../db/types.js';
import type { AnalysisResult } from '../types/analysis.js';
import type { StackHistoryEntry, StackHistoryResult } from '../types/parity.js';

const MAX_ENTRIES = 100;

export interface StackHistoryRow {
  id: number;
  url: string;
  analyzed_at: Date | string;
  result_json: string;
}

/** Hostname ohne www., lowercase; akzeptiert auch nackte Domains. null bei ungültiger Eingabe. */
export function normalizeHostname(urlOrHost: string): string | null {
  const raw = (urlOrHost ?? '').trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/\.+$/, '');
    return host.includes('.') ? host : null;
  } catch {
    return null;
  }
}

export function computeStackDelta(
  previous: string[],
  current: string[],
): { added: string[]; removed: string[]; unchanged: string[] } {
  const prev = new Set(previous);
  const curr = new Set(current);
  const sort = (a: string[]) => a.sort((x, y) => x.localeCompare(y));
  return {
    added: sort([...curr].filter((t) => !prev.has(t))),
    removed: sort([...prev].filter((t) => !curr.has(t))),
    unchanged: sort([...curr].filter((t) => prev.has(t))),
  };
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const s = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

/** Reine Logik: filtert Zeilen auf den Hostnamen, extrahiert starke Technologien, sortiert, bildet Delta. */
export function buildStackHistory(hostname: string, rows: StackHistoryRow[]): StackHistoryResult {
  const entries: StackHistoryEntry[] = [];
  for (const row of rows) {
    if (normalizeHostname(row.url) !== hostname) continue;
    let parsed: Partial<AnalysisResult>;
    try {
      parsed = JSON.parse(row.result_json) as Partial<AnalysisResult>;
    } catch {
      continue;
    }
    const technologies = [
      ...new Set((parsed.rawDetections ?? []).filter((d) => d && !d.weak).map((d) => d.name)),
    ].sort((a, b) => a.localeCompare(b));
    entries.push({ analysisId: Number(row.id), analyzedAt: toIso(row.analyzed_at), technologies });
  }
  entries.sort((a, b) => a.analyzedAt.localeCompare(b.analyzedAt) || a.analysisId - b.analysisId);

  const result: StackHistoryResult = { hostname, entries };
  if (entries.length >= 2) {
    const current = entries[entries.length - 1];
    const previous = entries[entries.length - 2];
    result.delta = {
      previousAnalysisId: previous.analysisId,
      ...computeStackDelta(previous.technologies, current.technologies),
    };
  }
  return result;
}

export async function getStackHistory(db: DbHandle, urlOrHost: string): Promise<StackHistoryResult> {
  const hostname = normalizeHostname(urlOrHost);
  if (!hostname) return { hostname: '', entries: [] };
  const pattern = `%${hostname.replace(/[!%_]/g, (c) => `!${c}`)}%`;
  const { rows } = await db.execute(
    `SELECT id, url, analyzed_at, result_json FROM analyses WHERE url LIKE ? ESCAPE '!' ORDER BY analyzed_at DESC LIMIT ${MAX_ENTRIES}`,
    [pattern],
  );
  return buildStackHistory(hostname, rows as StackHistoryRow[]);
}

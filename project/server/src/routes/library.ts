import type { Request, Response } from 'express';
import { getPool } from '../db/index.js';
import { listBriefingCompanyNames, listLibraryRows } from '../db/analyses.js';
import { isDbUnavailableError, isSchemaOutdatedError } from '../db/errors.js';
import { buildLibrary, type LibraryRow } from '../services/library.js';
import type { BriefingSummary } from '../types/briefing.js';

function parseBriefing(json: string | null): BriefingSummary | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as BriefingSummary) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Library: alle gespeicherten Analysen, gruppiert nach Account (Domain), alphabetisch.
 * Ohne DB → leere Liste (wie /api/analyses).
 */
export async function libraryRoute(_req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const pool = getPool();
  if (!pool) {
    res.json({ accounts: [], totalAnalyses: 0 });
    return;
  }
  try {
    const [rows, names] = await Promise.all([listLibraryRows(pool), listBriefingCompanyNames(pool)]);
    const libraryRows: LibraryRow[] = rows.map((r) => ({
      id: r.id,
      url: r.url,
      analyzedAt: r.analyzedAt,
      briefing: parseBriefing(r.briefingJson),
      companyName: names.get(r.id) ?? null,
    }));
    res.json({ accounts: buildLibrary(libraryRows), totalAnalyses: rows.length });
  } catch (error) {
    if (isDbUnavailableError(error) || isSchemaOutdatedError(error)) {
      res.json({ accounts: [], totalAnalyses: 0 });
      return;
    }
    throw error;
  }
}

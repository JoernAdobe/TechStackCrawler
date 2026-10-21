import type { BriefingSummary } from '../types/briefing.js';

/** Eine einzelne gespeicherte Analyse in der Library (ohne result_json). */
export interface LibraryAnalysis {
  id: number;
  url: string;
  analyzedAt: string;
  briefing?: BriefingSummary;
}

/** Ein Account = alle Analysen derselben Domain (ohne „www.“). */
export interface LibraryAccount {
  key: string;
  name: string;
  domain: string;
  analysisCount: number;
  latest: LibraryAnalysis;
  /** Neuestes fertiges Pre-Briefing über alle Analysen des Accounts. */
  briefing?: BriefingSummary & { analysisId: number };
  analyses: LibraryAnalysis[];
}

export interface LibraryRow {
  id: number;
  url: string;
  analyzedAt: string;
  briefing?: BriefingSummary;
  companyName?: string | null;
}

/** Domain-Schlüssel für die Gruppierung: Hostname, klein, ohne „www.“. */
export function accountKeyForUrl(url: string): string {
  const raw = url.trim();
  try {
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, '') || raw.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

const isDoneBriefing = (b?: BriefingSummary): b is BriefingSummary =>
  !!b && b.status === 'done' && typeof b.overallScore === 'number';

/** Gruppiert Analysen (beliebige Reihenfolge) zu Accounts, alphabetisch nach Name sortiert. */
export function buildLibrary(rows: LibraryRow[]): LibraryAccount[] {
  const byKey = new Map<string, LibraryRow[]>();
  for (const row of rows) {
    const key = accountKeyForUrl(row.url);
    const list = byKey.get(key);
    if (list) list.push(row);
    else byKey.set(key, [row]);
  }

  const time = (iso: string) => {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? 0 : t;
  };

  const accounts: LibraryAccount[] = [];
  for (const [key, list] of byKey) {
    list.sort((a, b) => time(b.analyzedAt) - time(a.analyzedAt) || b.id - a.id);
    const analyses = list.map(({ id, url, analyzedAt, briefing }) => ({
      id,
      url,
      analyzedAt,
      ...(briefing ? { briefing } : {}),
    }));
    const withBriefing = list.find((r) => isDoneBriefing(r.briefing));
    const name = list.find((r) => r.companyName?.trim())?.companyName?.trim() || key;
    accounts.push({
      key,
      name,
      domain: key,
      analysisCount: list.length,
      latest: analyses[0],
      ...(withBriefing ? { briefing: { ...withBriefing.briefing!, analysisId: withBriefing.id } } : {}),
      analyses,
    });
  }

  return accounts.sort((a, b) =>
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }),
  );
}

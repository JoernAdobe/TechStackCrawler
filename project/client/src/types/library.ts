import type { BriefingSummary } from './briefing';

/** Spiegel von server/src/services/library.ts (GET /api/library). */
export interface LibraryAnalysis {
  id: number;
  url: string;
  analyzedAt: string;
  briefing?: BriefingSummary;
}

export interface LibraryAccount {
  key: string;
  name: string;
  domain: string;
  analysisCount: number;
  latest: LibraryAnalysis;
  briefing?: BriefingSummary & { analysisId: number };
  analyses: LibraryAnalysis[];
}

export interface LibraryResponse {
  accounts: LibraryAccount[];
  totalAnalyses: number;
}

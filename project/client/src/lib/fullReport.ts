import type { AnalysisResult, UseCaseDiscoveryResult } from '../types/analysis';
import type { BriefingBlock, BriefingResult, BriefingSource, BriefingStateResponse } from '../types/briefing';
import { apiRequest } from './apiClient';

/** Alles, was die Exporte (Markdown, Excel) brauchen: aktuelle Analyse + fertiges Pre-Briefing. */
export interface FullReportData {
  analysis: AnalysisResult;
  briefing: BriefingResult | null;
}

/**
 * Holt für gespeicherte Analysen den aktuellen Server-Stand (Enrichments, Use Cases, Pre-Briefing),
 * damit der Export alles enthält, was die Tabs zeigen. Fällt bei Fehlern auf die lokale Analyse zurück.
 */
export async function loadFullReportData(
  results: AnalysisResult,
  useCases?: UseCaseDiscoveryResult | null,
): Promise<FullReportData> {
  let analysis = results;
  let briefing: BriefingResult | null = null;
  if (results.id != null) {
    const [fresh, state] = await Promise.all([
      apiRequest<AnalysisResult>(`/api/analyses/${results.id}`).catch(() => null),
      apiRequest<BriefingStateResponse>(`/api/analyses/${results.id}/briefing`).catch(() => null),
    ]);
    if (fresh) analysis = { ...results, ...fresh };
    if (state?.job?.status === 'done' && state.result) briefing = state.result;
  }
  const newer =
    useCases && (!analysis.useCaseDiscovery || (useCases.generatedAt ?? '') >= (analysis.useCaseDiscovery.generatedAt ?? ''));
  if (newer) analysis = { ...analysis, useCaseDiscovery: useCases };
  return { analysis, briefing };
}

export function hostnameOf(result: AnalysisResult): string {
  try {
    return new URL(result.finalUrl || result.url).hostname;
  } catch {
    return result.url;
  }
}

export function exportFilename(result: AnalysisResult, ext: string): string {
  const host = hostnameOf(result).replace(/^www\./, '').replace(/[^a-z0-9.-]+/gi, '-').replace(/\./g, '-');
  return `${host || 'analysis'}-account-radar.${ext}`;
}

/** Briefing-Baustein als Klartextzeilen (für Excel und Fallbacks). */
export function blockToLines(block: BriefingBlock): string[] {
  switch (block.type) {
    case 'paragraph':
      return [block.text];
    case 'note':
      return [`${block.title ? `${block.title}: ` : ''}${block.text}`];
    case 'feature-grid':
      return block.cards.map((c) => `${c.label}: ${c.value}${c.detail ? ` (${c.detail})` : ''}`);
    case 'steps':
      return block.items.map((i, n) => `${n + 1}. ${i.title}: ${i.body}`);
    case 'legend':
      return block.items.map((i) => `${i.label}: ${i.text}`);
    case 'table':
      return [block.headers.join(' | '), ...block.rows.map((r) => r.join(' | '))];
  }
}

export function sourceLabel(s: BriefingSource): string {
  return [s.title, s.publisher, s.date, s.independent ? '' : 'client-owned', s.snippetOnly ? 'snippet only' : '']
    .filter(Boolean)
    .join(' · ');
}

export function triggerDownload(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

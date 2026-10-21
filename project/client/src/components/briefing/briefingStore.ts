import { useSyncExternalStore } from 'react';
import type { BriefingResult, BriefingSectionId } from '../../types/briefing';

/**
 * Teilt das fertige Pre-Briefing der aktuell angezeigten Analyse mit anderen
 * Ergebnis-Sektionen (z. B. „Opportunities“), ohne einen zweiten Poll zu starten.
 */
let current: { analysisId: number; result: BriefingResult } | null = null;
const listeners = new Set<() => void>();

export function publishBriefingResult(analysisId: number, result: BriefingResult | null): void {
  const next = result ? { analysisId, result } : null;
  if (current?.analysisId === next?.analysisId && current?.result === next?.result) return;
  if (!next && current && current.analysisId !== analysisId) return;
  current = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSharedBriefingResult(analysisId: number | undefined): BriefingResult | null {
  const snapshot = useSyncExternalStore(subscribe, () => current, () => null);
  return snapshot && snapshot.analysisId === analysisId ? snapshot.result : null;
}

/** Adobe-Opportunity-Abschnitt: im UI nur einmal, in der Sektion „Opportunities“. */
export const ADOBE_OPPORTUNITY_SECTION: BriefingSectionId = 's14';
export const MERGED_OPPORTUNITY_ANCHOR = 'section-insights-briefing';

export interface MergedSectionTarget {
  /** Anker des eingebetteten Blocks im Analyzer-Tab. */
  anchor: string;
  /** Name des Analyzer-Tabs. */
  tab: string;
  heading: string;
  subtitle: string;
}

/**
 * Abschnitte, die der Analyzer selbst misst bzw. zeigt: Sie erscheinen einmal im passenden Tab
 * (mit denselben Kennzahlen); im Pre-Briefing steht nur ein Verweis.
 */
export const MERGED_SECTIONS: Partial<Record<BriefingSectionId, MergedSectionTarget>> = {
  s04: {
    anchor: 'section-stack-briefing',
    tab: 'Tech Stack',
    heading: 'Digital strategy from the Client Pre-Briefing',
    subtitle: 'Researched from public sources; the technology numbers are the measured ones from this tab.',
  },
  s07: {
    anchor: 'section-geo-briefing',
    tab: 'GEO Score',
    heading: 'Search strategy from the Client Pre-Briefing',
    subtitle: 'Researched from public sources; all metrics come from the GEO Score, Semrush and Lighthouse measurements.',
  },
  s14: {
    anchor: MERGED_OPPORTUNITY_ANCHOR,
    tab: 'Opportunities',
    heading: 'Adobe plays from the Client Pre-Briefing',
    subtitle: 'Researched from public sources and combined with the tech-stack opportunities above.',
  },
};

export const BRIEFING_SUMMARY_ANCHOR = 'briefing-summary';
export const BRIEFING_SUBNAV_LABEL = 'Pre-Briefing sections';

/** Unterkante von Header + Haupt-Sektionsleiste (beide sticky). */
export function stickyChromeBottom(): number {
  const header = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
  const nav = document.querySelector('nav[aria-label="Result sections"]')?.getBoundingClientRect();
  return Math.max(0, header, nav ? nav.bottom : 0);
}

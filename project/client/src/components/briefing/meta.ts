import {
  BarChart3, Building2, Compass, Cpu, FileText, Globe, Lightbulb, Megaphone,
  Network, Package, Search, Target, Trophy, Users, type LucideIcon,
} from 'lucide-react';
import {
  BRIEFING_LOCKED_SECTION,
  BRIEFING_SECTIONS,
  BRIEFING_SECTION_IDS,
  type BriefingSectionId,
  type BriefingSectionMeta,
  type Confidence,
  type ScoreBand,
} from '../../types/briefing';

const ICONS: Record<string, LucideIcon> = {
  BarChart3, Building2, Compass, Cpu, FileText, Globe, Lightbulb, Megaphone,
  Network, Package, Search, Target, Trophy, Users,
};

export function sectionIcon(meta: Pick<BriefingSectionMeta, 'icon'>): LucideIcon {
  return ICONS[meta.icon] ?? FileText;
}

export function sectionMeta(id: BriefingSectionId): BriefingSectionMeta | undefined {
  return BRIEFING_SECTIONS.find((s) => s.id === id);
}

export function sectionTitle(id: BriefingSectionId): string {
  return sectionMeta(id)?.title ?? id;
}

export const sectionAnchor = (id: BriefingSectionId) => `briefing-${id}`;

/** Gültige, sortierte Auswahl; s14 ist immer enthalten. */
export function normalizeSections(ids: readonly string[]): BriefingSectionId[] {
  const set = new Set<string>(ids);
  set.add(BRIEFING_LOCKED_SECTION);
  return BRIEFING_SECTION_IDS.filter((id) => set.has(id));
}

export const ALL_SECTIONS: BriefingSectionId[] = [...BRIEFING_SECTION_IDS];

/** Ampel-Stile mit ausreichendem Kontrast auf dunklen Surfaces. */
export const BAND_STYLES: Record<ScoreBand, { label: string; stroke: string; text: string; chip: string }> = {
  high: { label: 'High priority', stroke: '#4ADE80', text: 'text-emerald-300', chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' },
  medium: { label: 'Medium priority', stroke: '#FBBF24', text: 'text-amber-300', chip: 'border-amber-400/40 bg-amber-400/10 text-amber-200' },
  low: { label: 'Low priority', stroke: '#F87171', text: 'text-red-300', chip: 'border-red-400/40 bg-red-400/10 text-red-200' },
};

export function bandForScore(score: number): ScoreBand {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export const CONFIDENCE_STYLES: Record<Confidence, string> = {
  high: 'border-emerald-400/40 text-emerald-200',
  medium: 'border-amber-400/40 text-amber-200',
  low: 'border-ts-border text-ts-text-secondary',
};

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Nur http(s)-Links zulassen; alles andere wird als Text gezeigt. */
export function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

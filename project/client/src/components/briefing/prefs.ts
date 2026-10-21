import type { BriefingSectionId } from '../../types/briefing';
import { ALL_SECTIONS, normalizeSections } from './meta';

const ENABLED_KEY = 'ts.briefing.enabled';
const SECTIONS_KEY = 'ts.briefing.sections';

export function loadBriefingEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function loadBriefingSections(): BriefingSectionId[] {
  try {
    const raw = localStorage.getItem(SECTIONS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return normalizeSections(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    // Kaputter Eintrag → Standard
  }
  return ALL_SECTIONS;
}

export function saveBriefingPrefs(enabled: boolean, sections: BriefingSectionId[]): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
    localStorage.setItem(SECTIONS_KEY, JSON.stringify(sections));
  } catch {
    // Private Mode / Quota – Auswahl gilt dann nur für diese Sitzung.
  }
}

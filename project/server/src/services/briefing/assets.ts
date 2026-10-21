/**
 * Lädt Chris Whiteheads Inhaltsstandard (server/assets/briefing, unverändert übernommen)
 * und schneidet die je Abschnitt relevanten Teile heraus.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BriefingSectionId } from '../../types/briefing.js';

/** src/services/briefing → server/assets/briefing (identisch für dist/services/briefing). */
export function resolveBriefingAssetsDir(): string {
  const candidates = [
    process.env.BRIEFING_ASSETS_DIR,
    fileURLToPath(new URL('../../../assets/briefing/', import.meta.url)),
    path.join(process.cwd(), 'assets', 'briefing'),
    path.join(process.cwd(), 'server', 'assets', 'briefing'),
  ].filter((p): p is string => Boolean(p));
  const found = candidates.find((p) => existsSync(path.join(p, 'workflow', 'standard-sections.md')));
  if (!found) throw new Error(`Briefing assets not found (tried: ${candidates.join(', ')})`);
  return found;
}

export interface BriefingAssets {
  standardSections: string;
  researchGuide: string;
  qualityChecklist: string;
  adobeProducts: string;
  components: string;
}

let cached: BriefingAssets | null = null;

export function loadBriefingAssets(): BriefingAssets {
  if (cached) return cached;
  const dir = resolveBriefingAssetsDir();
  const read = (rel: string) => readFileSync(path.join(dir, rel), 'utf8');
  cached = {
    standardSections: read('workflow/standard-sections.md'),
    researchGuide: read('workflow/research-guide.md'),
    qualityChecklist: read('workflow/quality-checklist.md'),
    adobeProducts: read('workflow/adobe-products.md'),
    components: read('design/components.md'),
  };
  return cached;
}

/** Markdown-Teil ab einer Überschrift (Regex auf die Überschriftszeile) bis zur nächsten gleich-/höherrangigen. */
export function extractMarkdownSection(md: string, heading: RegExp): string {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) return '';
  const level = (lines[start].match(/^#+/)?.[0].length ?? 2);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n').replace(/\n-{3,}\s*$/m, '').trim();
}

/** HTML-Entities aus Chris' Markdown (z. B. `&amp;`) für Plaintext-Prompts glätten. */
const plain = (s: string) => s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');

export function sectionStandard(assets: BriefingAssets, id: BriefingSectionId): string {
  return plain(extractMarkdownSection(assets.standardSections, new RegExp(`^##\\s+${id}\\b`)));
}

export function sectionResearchGuide(assets: BriefingAssets, id: BriefingSectionId): string {
  return plain(extractMarkdownSection(assets.researchGuide, new RegExp(`^##\\s+${id}\\b`)));
}

/** Zeile der „Where to look beyond the client's own site“-Tabelle für den Abschnitt. */
export function independentSourcesRow(assets: BriefingAssets, id: BriefingSectionId): string {
  const row = assets.researchGuide.split('\n').find((l) => new RegExp(`^\\|\\s*${id}\\b`).test(l));
  return row ? row.split('|').map((c) => c.trim()).filter(Boolean).slice(1).join(' ') : '';
}

export function commonRules(assets: BriefingAssets): string {
  return [
    extractMarkdownSection(assets.researchGuide, /^##\s+Recency & sourcing rules/),
    extractMarkdownSection(assets.researchGuide, /^##\s+Source independence/).split('**Where to look')[0].trim(),
    extractMarkdownSection(assets.researchGuide, /^##\s+Research tactics/),
    extractMarkdownSection(assets.researchGuide, /^##\s+Research quality bar/),
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function componentMapping(assets: BriefingAssets): string {
  return extractMarkdownSection(assets.components, /^##\s+Content → Component mapping/);
}

/** Nur der Inhalts-Teil der Qualitäts-Checkliste (Struktur/Design übernimmt der Renderer). */
export function contentChecklist(assets: BriefingAssets): string {
  return plain(extractMarkdownSection(assets.qualityChecklist, /^##\s+Content/));
}

import type {
  AnalysisResult,
  CategoryResult,
  DetectedTechnology,
} from '../types/analysis';

/**
 * TechCase Insights export.
 *
 * Erzeugt ein Markdown-Dokument, das entlang der Adobe-TechCase-Sektionen
 * (03 Current State, 04 Proposed Solutions, 06 Use Cases, 07 Integration Landscape)
 * gegliedert ist. Deal-spezifische Felder (ARR, Commercials, Stakeholder) werden
 * bewusst NICHT erzeugt — die trägt der Solution Consultant manuell nach.
 */

const NOT_DETECTED = new Set(['Not Detected', 'N/A', 'Unknown', '']);

/** Kategorien, die im TechCase als 3rd-Party-Integrationen (Sektion 07) zählen. */
const INTEGRATION_CATEGORIES = new Set([
  'CRM',
  'CDP',
  'DMP',
  'ESP/Marketing Automation',
  'Marketing Automation',
  'EDW',
  'Payments',
  'Search',
  'Tag Management',
  'Customer Support',
]);

function esc(value: string | undefined): string {
  return (value ?? '').replace(/\|/g, '\\|').replace(/\s*\n+\s*/g, ' ').trim();
}

function isMeaningful(value: string | undefined): boolean {
  return !!value && !NOT_DETECTED.has(value.trim());
}

function hostnameOf(result: AnalysisResult): string {
  try {
    return new URL(result.finalUrl || result.url).hostname;
  } catch {
    return result.url;
  }
}

function confidenceLabel(tech: DetectedTechnology): string {
  return tech.weak ? 'unverified' : `${tech.confidence}%`;
}

function techLabel(tech: DetectedTechnology): string {
  return `${esc(tech.name)}${tech.version ? ` v${esc(tech.version)}` : ''}`;
}

/** True, wenn die Analyse Use Cases enthält (Sektion 06 ist dann befüllbar). */
export function hasUseCases(result: AnalysisResult): boolean {
  return !!result.useCaseDiscovery && result.useCaseDiscovery.useCases.length > 0;
}

/** 3rd-Party-Systeme für Sektion 07. */
export function integrationDetections(result: AnalysisResult): DetectedTechnology[] {
  return result.rawDetections
    .filter((t) => t.categories.some((c) => INTEGRATION_CATEGORIES.has(c)))
    .sort((a, b) => b.confidence - a.confidence);
}

/** Kategorien mit einer sinnvollen Adobe-Opportunity für Sektion 04. */
export function adobeOpportunities(result: AnalysisResult): CategoryResult[] {
  return result.categories.filter((c) => isMeaningful(c.adobeOpportunity));
}

export function generateTechCaseMarkdown(result: AnalysisResult): string {
  const lines: string[] = [];
  const host = hostnameOf(result);
  const dateStr = new Date(result.analyzedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  lines.push(`# TechCase Insights — ${host}`);
  lines.push('');
  lines.push(
    `> Auto-generated from TechStack Analyzer · Source: ${result.finalUrl || result.url} · ${dateStr}`,
  );
  lines.push(
    '> Copy the sections below into the matching TechCase slides. Deal-specific data (ARR, commercials, stakeholders) must be added manually.',
  );
  lines.push('');

  // ── Context (Sektion 01–02) ──
  lines.push('## Context (for Sections 01–02)');
  lines.push('');
  lines.push(isMeaningful(result.summary) ? result.summary.trim() : '_No summary available._');
  lines.push('');

  // ── 03 Current State Technology & Challenges ──
  lines.push('## 03 Current State Technology & Challenges');
  lines.push('');
  lines.push('**Vendor Stack (detected):**');
  lines.push('');
  if (result.rawDetections.length > 0) {
    lines.push('| Vendor | Category | Confidence |');
    lines.push('|--------|----------|------------|');
    for (const t of [...result.rawDetections].sort((a, b) => b.confidence - a.confidence)) {
      lines.push(`| ${techLabel(t)} | ${esc(t.categories.join(', '))} | ${confidenceLabel(t)} |`);
    }
  } else {
    lines.push('_No technologies auto-detected._');
  }
  lines.push('');
  lines.push('**Pain Points by Category:**');
  lines.push('');
  const withPain = result.categories.filter(
    (c) => isMeaningful(c.currentTechnology) && isMeaningful(c.challengesAndPainPoints),
  );
  if (withPain.length > 0) {
    for (const c of withPain) {
      lines.push(
        `- **${esc(c.category)}** (${esc(c.currentTechnology)}): ${esc(c.challengesAndPainPoints)}`,
      );
    }
  } else {
    lines.push('_No pain points identified._');
  }
  lines.push('');

  // ── 04 Proposed Solutions & Capabilities ──
  lines.push('## 04 Proposed Solutions & Capabilities');
  lines.push('');
  const opps = adobeOpportunities(result);
  if (opps.length > 0) {
    lines.push('| Challenge | Adobe Solution | Area (Category) |');
    lines.push('|-----------|----------------|-----------------|');
    for (const c of opps) {
      const challenge = isMeaningful(c.challengesAndPainPoints)
        ? esc(c.challengesAndPainPoints)
        : esc(c.category);
      lines.push(`| ${challenge} | ${esc(c.adobeOpportunity)} | ${esc(c.category)} |`);
    }
  } else {
    lines.push('_No Adobe opportunities identified._');
  }
  lines.push('');

  // ── 06 Key Use Cases + ROI ──
  lines.push('## 06 Key Use Cases + ROI');
  lines.push('');
  const uc = result.useCaseDiscovery;
  if (uc && uc.useCases.length > 0) {
    if (isMeaningful(uc.summary)) {
      lines.push(`_${esc(uc.summary)}_`);
      lines.push('');
    }
    for (const u of [...uc.useCases].sort((a, b) => a.rank - b.rank)) {
      lines.push(`### ${u.rank}. ${esc(u.title)}`);
      lines.push(`- **Description:** ${esc(u.description)}`);
      if (u.adobeProducts.length > 0) {
        lines.push(`- **Adobe Products:** ${esc(u.adobeProducts.join(', '))}`);
      }
      lines.push(`- **Business Value:** ${esc(u.businessValue)}`);
      if (isMeaningful(u.quantifiedRoi)) {
        lines.push(`- **Quantified ROI:** ${esc(u.quantifiedRoi)}`);
      }
      if (isMeaningful(u.industryBenchmark)) {
        lines.push(`- **Industry Benchmark:** ${esc(u.industryBenchmark)}`);
      }
      const priority = [
        u.impact ? `Impact: ${u.impact}` : '',
        u.effort ? `Effort: ${u.effort}` : '',
        isMeaningful(u.timeToValue) ? `Time to value: ${esc(u.timeToValue)}` : '',
      ].filter(Boolean);
      if (priority.length > 0) {
        lines.push(`- **Prioritization:** ${priority.join(' · ')}`);
      }
      if (isMeaningful(u.implementationHint)) {
        lines.push(`- **Implementation Hint:** ${esc(u.implementationHint)}`);
      }
      lines.push('');
    }
  } else {
    lines.push(
      '_Use cases not generated yet. Run "Discover Use Cases" first to populate this section._',
    );
    lines.push('');
  }

  // ── 07 Integration Landscape & Dependencies ──
  lines.push('## 07 Integration Landscape & Dependencies');
  lines.push('');
  const integrations = integrationDetections(result);
  if (integrations.length > 0) {
    lines.push('| 3rd-Party System | Type | Confidence |');
    lines.push('|------------------|------|------------|');
    for (const t of integrations) {
      lines.push(`| ${techLabel(t)} | ${esc(t.categories.join(', '))} | ${confidenceLabel(t)} |`);
    }
  } else {
    lines.push(
      '_No 3rd-party integration systems detected (CRM, CDP, ESP, EDW, Payments, Search, Tag Management)._',
    );
  }
  lines.push('');

  lines.push('---');
  lines.push('*Generated by TechStack Analyzer — TechCase Insights export*');

  return lines.join('\n');
}

export function downloadTechCaseMarkdown(result: AnalysisResult) {
  const md = generateTechCaseMarkdown(result);
  // Data-URL statt Blob – funktioniert auch über HTTP (kein "insecure blob" Fehler)
  const dataUrl = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(md);
  const a = document.createElement('a');
  a.href = dataUrl;

  try {
    const host = new URL(result.finalUrl || result.url).hostname.replace(/\./g, '-');
    a.download = `techcase-insights-${host}.md`;
  } catch {
    a.download = 'techcase-insights.md';
  }

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

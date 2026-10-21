/**
 * PDF-/HTML-Report der kompletten Analyse („Account Radar“): Tech Stack,
 * Adobe Opportunities und Use Cases – optional angehängt an das Pre-Briefing,
 * im selben Report-Design (styles.css aus dem Client-Report-Repo).
 */
import type { AnalysisResult } from '../types/analysis.js';
import { escapeHtml, stylesCss } from './briefing/render.js';

const NOT_DETECTED = new Set(['', 'n/a', 'not detected', 'unknown', 'none']);
const P = 'font-size:13px;color:#333;line-height:1.65;';
const TH =
  'padding:8px 12px;text-align:left;border-bottom:2px solid var(--red);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;';
const TD = 'padding:8px 12px;vertical-align:top;border-bottom:1px solid #e5e5e5;';
const TABLE = 'width:100%;border-collapse:collapse;font-size:12px;margin-top:12px;';

const detected = (v: string | undefined) => !NOT_DETECTED.has((v ?? '').trim().toLowerCase());

export function analysisHost(analysis: Pick<AnalysisResult, 'url' | 'finalUrl'>): string {
  try {
    return new URL(analysis.finalUrl || analysis.url).hostname.replace(/^www\./, '');
  } catch {
    return analysis.url;
  }
}

function section(id: string, eyebrow: string, title: string, body: string[]): string {
  return [
    `  <div class="section" id="${id}">`,
    '    <div class="section-bar">',
    `      <span class="s-label">${escapeHtml(eyebrow)}</span>`,
    `      <h2>${escapeHtml(title)}</h2>`,
    '    </div>',
    ...body,
    '  </div>',
  ].join('\n');
}

function table(headers: string[], rows: string[][]): string {
  return [
    `    <table style="${TABLE}">`,
    `      <thead><tr style="background:var(--gray-light);">${headers.map((h) => `<th style="${TH}">${escapeHtml(h)}</th>`).join('')}</tr></thead>`,
    '      <tbody>',
    ...rows.map((r) => `        <tr>${r.map((c, i) => `<td style="${TD}${i === 0 ? 'font-weight:600;' : ''}">${escapeHtml(c)}</td>`).join('')}</tr>`),
    '      </tbody>',
    '    </table>',
  ].join('\n');
}

/** Die Analyse-Abschnitte als HTML-Fragmente (ohne Dokument-Hülle). */
export function renderAnalysisSections(analysis: AnalysisResult): string {
  const date = new Date(analysis.analyzedAt);
  const dateStr = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const stack = analysis.categories.filter((c) => detected(c.currentTechnology));
  const opportunities = analysis.categories.filter((c) => detected(c.adobeOpportunity));
  const useCases = analysis.useCaseDiscovery?.useCases ?? [];
  const parts: string[] = [];

  parts.push(section('ts-stack', 'Tech Stack Analysis', 'Current Technology Stack.', [
    `    <p style="${P}">${escapeHtml(analysis.summary)}</p>`,
    `    <p style="${P}color:#666;">Scanned: ${escapeHtml(analysis.finalUrl || analysis.url)}${dateStr ? ` · ${escapeHtml(dateStr)}` : ''} · ${analysis.rawDetections.length} technologies detected</p>`,
    stack.length
      ? table(['Category', 'Current technology', 'Challenges & pain points'], stack.map((c) => [c.category, c.currentTechnology, c.challengesAndPainPoints]))
      : `    <p style="${P}">No technologies detected.</p>`,
  ]));

  if (opportunities.length) {
    parts.push(section('ts-opportunities', 'Adobe Alignment', 'Adobe Opportunities from the Tech Stack.', [
      table(['Category', 'Current', 'Adobe opportunity'], opportunities.map((c) => [c.category, c.currentTechnology, c.adobeOpportunity])),
    ]));
  }

  if (useCases.length) {
    parts.push(section('ts-use-cases', 'Use Case Discovery', 'Key Use Cases.', useCases.slice(0, 10).map((u) => [
      '    <div style="margin-top:14px;break-inside:avoid;">',
      `      <p style="${P}margin:0;"><b>${escapeHtml(`${u.rank}. ${u.title}`)}</b></p>`,
      `      <p style="${P}margin:2px 0;">${escapeHtml(u.description)}</p>`,
      u.adobeProducts.length ? `      <p style="${P}margin:2px 0;color:#666;"><b>Adobe:</b> ${escapeHtml(u.adobeProducts.join(', '))}</p>` : '',
      u.businessValue ? `      <p style="${P}margin:2px 0;color:#666;"><b>Value:</b> ${escapeHtml(u.businessValue)}${u.quantifiedRoi ? ` (${escapeHtml(u.quantifiedRoi)})` : ''}</p>` : '',
      '    </div>',
    ].filter(Boolean).join('\n'))));
  }

  return parts.join('\n\n  <hr>\n\n');
}

/**
 * Komplettreport: hängt die Analyse an ein vorhandenes Pre-Briefing-HTML an
 * (vor dem Footer) oder baut ein eigenständiges Dokument im selben Design.
 */
export function buildAnalysisReportHtml(analysis: AnalysisResult, briefingHtml: string | null): string {
  const sections = renderAnalysisSections(analysis);
  if (briefingHtml && briefingHtml.includes('<footer>')) {
    const idx = briefingHtml.indexOf('  <footer>') >= 0 ? briefingHtml.indexOf('  <footer>') : briefingHtml.indexOf('<footer>');
    return `${briefingHtml.slice(0, idx)}  <hr>\n\n${sections}\n\n${briefingHtml.slice(idx)}`;
  }
  const host = escapeHtml(analysisHost(analysis));
  const year = new Date().getUTCFullYear();
  return `<!DOCTYPE html>
<html lang="en"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>${host} — Account Radar</title>
<style>
${stylesCss()}
</style>
</head>
<body>
<header>
  <div class="eyebrow">Adobe &nbsp;|&nbsp; Account Radar</div>
  <h1>${host}</h1>
  <p class="sub">Tech Stack · Adobe Opportunities · Use Cases</p>
</header>
<div class="container">
${sections}
  <footer>
    <p>© ${year} Adobe. Adobe Internal Only. &nbsp;|&nbsp; Generated by Account Radar</p>
  </footer>
</div>
</body>
</html>
`;
}

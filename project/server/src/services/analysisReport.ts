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
export function renderAnalysisSections(analysis: AnalysisResult, sizing: LicenseSizingRow[] = []): string {
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
    parts.push(section('ts-use-cases', 'Use Case Discovery', 'Key Use Cases.', useCases.map((u) => [
      '    <div style="margin-top:14px;break-inside:avoid;">',
      `      <p style="${P}margin:0;"><b>${escapeHtml(`${u.rank}. ${u.title}`)}</b></p>`,
      `      <p style="${P}margin:2px 0;">${escapeHtml(u.description)}</p>`,
      u.adobeProducts.length ? `      <p style="${P}margin:2px 0;color:#666;"><b>Adobe:</b> ${escapeHtml(u.adobeProducts.join(', '))}</p>` : '',
      u.businessValue ? `      <p style="${P}margin:2px 0;color:#666;"><b>Value:</b> ${escapeHtml(u.businessValue)}${u.quantifiedRoi ? ` (${escapeHtml(u.quantifiedRoi)})` : ''}</p>` : '',
      '    </div>',
    ].filter(Boolean).join('\n'))));
  }

  parts.push(...renderExtraSections(analysis, sizing));

  return parts.join('\n\n  <hr>\n\n');
}

/** Vom Client berechnetes License Sizing (inkl. im Tab geänderter Annahmen). */
export interface LicenseSizingRow {
  product: string;
  metric: string;
  unit: string;
  low: number;
  mid: number;
  high: number;
  licenseUnit: string;
  licenseUnits?: number;
  confidence: string;
  detected?: string[];
}

const INTEGRATION_CATEGORIES = new Set([
  'CRM', 'CDP', 'DMP', 'ESP/Marketing Automation', 'Marketing Automation', 'EDW', 'Payments', 'Search', 'Tag Management', 'Customer Support',
]);
const n = (v: number | null | undefined) => (v === null || v === undefined ? '–' : Math.round(v).toLocaleString('en-US'));
const compactNum = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(Math.round(v));
const para = (text: string, extra = '') => `    <p style="${P}${extra}">${escapeHtml(text)}</p>`;

/** Tech Case, Deep Dive, ObservePoint, GEO Score und License Sizing – wie die Tabs im UI. */
function renderExtraSections(a: AnalysisResult, sizing: LicenseSizingRow[]): string[] {
  const e = a.enrichments ?? {};
  const parts: string[] = [];

  const integrations = a.rawDetections
    .filter((t) => t.categories.some((c) => INTEGRATION_CATEGORIES.has(c)))
    .sort((x, y) => y.confidence - x.confidence);
  if (integrations.length) {
    parts.push(section('ts-tech-case', 'Tech Case', 'Integration Landscape & Dependencies.', [
      table(['3rd-party system', 'Type', 'Confidence'], integrations.map((t) => [
        `${t.name}${t.version ? ` v${t.version}` : ''}`, t.categories.join(', '), t.weak ? 'unverified' : `${t.confidence}%`,
      ])),
    ]));
  }

  const deep: string[] = [];
  const lh = e.lighthouse;
  if (lh && !lh.error) {
    const strategies = (['mobile', 'desktop'] as const).filter((k) => lh[k]);
    deep.push(para('Lighthouse (PageSpeed Insights)', 'font-weight:600;margin-top:12px;'));
    deep.push(table(['Strategy', 'Performance', 'Accessibility', 'Best practices', 'SEO', 'LCP (ms)', 'CLS'], strategies.map((k) => {
      const r = lh[k]!;
      return [k, n(r.scores.performance), n(r.scores.accessibility), n(r.scores.bestPractices), n(r.scores.seo), n(r.vitals.lcpMs), r.vitals.cls === undefined ? '–' : String(r.vitals.cls)];
    })));
  }
  const t = e.traffic;
  if (t) {
    const s = t.semrush;
    const rows: string[][] = [];
    if (t.trancoRank) rows.push(['Tranco rank', n(t.trancoRank)]);
    if (s?.visits) rows.push(['Monthly visits', n(s.visits)]);
    if (s?.uniqueVisitors) rows.push(['Unique visitors', n(s.uniqueVisitors)]);
    if (s?.pagesPerVisit) rows.push(['Pages per visit', s.pagesPerVisit.toFixed(2)]);
    if (s?.bounceRatePct !== undefined) rows.push(['Bounce rate', `${s.bounceRatePct.toFixed(1)}%`]);
    if (s?.organicTraffic) rows.push(['Organic traffic (est.)', n(s.organicTraffic)]);
    if (s?.topCountries.length) rows.push(['Top countries', s.topCountries.slice(0, 5).map((c) => `${c.country} ${c.sharePct.toFixed(0)}%`).join(', ')]);
    if (rows.length) deep.push(para(`Traffic${s?.displayDate ? ` (${s.displayDate})` : ''}`, 'font-weight:600;margin-top:16px;'), table(['Metric', 'Value'], rows));
  }
  const apps = e.mobileApps?.apps ?? [];
  if (apps.length) {
    deep.push(para('Mobile apps', 'font-weight:600;margin-top:16px;'));
    deep.push(table(['App', 'Store', 'Publisher', 'Rating', 'Last updated'], apps.map((p) => [
      p.name, p.store, p.publisher ?? '', p.rating ? p.rating.toFixed(1) : '', p.lastUpdated ?? '',
    ])));
  }
  const em = e.evidenceMatrix;
  if (em) {
    deep.push(para(`Evidence matrix: agreement ${em.stats.agreementRate === null ? '–' : `${Math.round(em.stats.agreementRate)}%`} · confirmed ${em.stats.confirmed} · TechStack only ${em.stats.techstackOnly} · ObservePoint only ${em.stats.observepointOnly}`, 'margin-top:16px;'));
  }
  if (deep.length) parts.push(section('ts-deep-dive', 'Deep Dive', 'Performance, Traffic & Apps.', deep));

  const op = e.observepoint;
  if (op) {
    const body = [para(`Status: ${op.status}${op.pagesScanned ? ` · ${op.pagesScanned} pages scanned` : ''}${op.runCompletedAt ? ` · run ${op.runCompletedAt.slice(0, 10)}` : ''}`, 'color:#666;')];
    if (op.tags.length) body.push(table(['Tag', 'Category', 'Pages', 'Accounts'], op.tags.map((x) => [x.name, x.category, String(x.pagesPresent), (x.accounts ?? []).join(', ')])));
    const findings = op.insights?.findings ?? [];
    if (findings.length) {
      body.push(para('Findings', 'font-weight:600;margin-top:16px;'));
      body.push(table(['Severity', 'Finding', 'Evidence', 'Adobe angle'], findings.map((f) => [f.severity, f.title, f.evidence, f.adobeAngle])));
    }
    parts.push(section('ts-observepoint', 'ObservePoint', 'Tag Audit & Findings.', body));
  }

  const g = e.geo;
  if (g) {
    const body = [
      para(`GEO score ${g.geoScore}/100 · AI visibility ${g.aiVisibility}% · share of voice ${g.shareOfVoicePct}% · ${g.marketPosition} · ${g.brand} (${g.country}, ${g.industry})`),
    ];
    if (g.funnel.length) body.push(table(['Stage', 'Queries', 'Mentions', 'Visibility'], g.funnel.map((f) => [f.stage, String(f.queries), String(f.mentions), `${f.visibilityPct}%`])));
    if (g.competitors.length) body.push(table(['Competitor', 'Mentions', 'Visibility'], g.competitors.map((c) => [c.name, String(c.mentions), `${c.visibilityPct}%`])));
    if (g.recommendations.length) body.push(...g.recommendations.map((r) => para(`• ${r}`, 'margin:4px 0;')));
    parts.push(section('ts-geo', 'GEO Score', 'AI Search Visibility.', body));
  }

  if (sizing.length) {
    parts.push(section('ts-license', 'License Sizing', 'Indicative License Volumes.', [
      para('Indicative estimate based on measured website data – not a quote.', 'color:#666;'),
      table(['Product', 'Metric', 'Low', 'Mid', 'High', 'License unit', 'Confidence'], sizing.map((r) => [
        r.product, `${r.metric} (${r.unit})`, compactNum(r.low), compactNum(r.mid), compactNum(r.high),
        `${r.licenseUnit}${r.licenseUnits ? ` · ${r.licenseUnits.toLocaleString('en-US')} units` : ''}`, r.confidence,
      ])),
    ]));
  }
  return parts;
}

/**
 * Komplettreport: hängt die Analyse an ein vorhandenes Pre-Briefing-HTML an
 * (vor dem Footer) oder baut ein eigenständiges Dokument im selben Design.
 */
export function buildAnalysisReportHtml(
  analysis: AnalysisResult,
  briefingHtml: string | null,
  sizing: LicenseSizingRow[] = [],
): string {
  const sections = renderAnalysisSections(analysis, sizing);
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
  <p class="sub">Tech Stack · Opportunities · Use Cases · Deep Dive · GEO · License Sizing</p>
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

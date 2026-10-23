import type { AnalysisResult } from '../types/analysis';
import type { BriefingBlock, BriefingResult } from '../types/briefing';
import { compact, currentLicenseEstimates } from './licenseSizing';
import { adobeOpportunities, integrationDetections } from './techCaseMarkdown';
import { exportFilename, hostnameOf, sourceLabel, triggerDownload, type FullReportData } from './fullReport';

const NOT_DETECTED = new Set(['', 'n/a', 'not detected', 'unknown', 'none']);
const meaningful = (v: string | undefined) => !NOT_DETECTED.has((v ?? '').trim().toLowerCase());
/** Zelleninhalt: Pipes escapen, Zeilenumbrüche glätten. */
const cell = (v: unknown) => String(v ?? '').replace(/\|/g, '\\|').replace(/\s*\n+\s*/g, ' ').trim();
const fmt = (n: number | null | undefined, suffix = '') => (n === null || n === undefined ? '–' : `${Math.round(n).toLocaleString('en-US')}${suffix}`);

function table(headers: string[], rows: unknown[][]): string[] {
  return [
    `| ${headers.map(cell).join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
    '',
  ];
}

function blockMd(block: BriefingBlock): string[] {
  switch (block.type) {
    case 'paragraph':
      return [block.text, ''];
    case 'note':
      return [`> ${block.title ? `**${block.title}:** ` : ''}${block.text}`, ''];
    case 'feature-grid':
      return table(['Label', 'Value', 'Detail'], block.cards.map((c) => [c.label, c.value, c.detail ?? '']));
    case 'steps':
      return [...block.items.map((i, n) => `${n + 1}. **${i.title}** ${i.body}`), ''];
    case 'legend':
      return [...block.items.map((i) => `- **${i.label}:** ${i.text}`), ''];
    case 'table':
      return table(block.headers, block.rows);
  }
}

function briefingMd(b: BriefingResult): string[] {
  const out: string[] = ['## Client Pre-Briefing', ''];
  const ex = b.executive;
  out.push(`*${b.companyName} · ${b.domain} · generated ${new Date(b.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · Client Pre-Briefing powered by Chris Whitehead*`, '');
  out.push('### Executive Summary', '');
  out.push(`**Overall Pre-Briefing Score:** ${ex.overallScore ?? '–'} / 100 · ${ex.band} priority · confidence: ${ex.confidence}`, '');
  if (ex.verdict) out.push(`> ${ex.verdict}`, '');
  for (const bl of ex.bullets) out.push(`- **${bl.label}:** ${bl.text}`);
  if (ex.bullets.length) out.push('');
  if (ex.subScores.length) {
    out.push('#### Score breakdown', '');
    out.push(...table(['Dimension', 'Weight', 'Score', 'Rationale'], ex.subScores.map((s) => [s.label, `${Math.round(s.weight * 100)}%`, s.value ?? 'not assessed', s.rationale])));
  }
  if (ex.topPlays.length) {
    out.push('#### Top Adobe plays', '');
    out.push(...table(['Product', 'Play', 'Based on'], ex.topPlays.map((p) => [p.product, p.headline, p.basedOn])));
  }
  for (const s of b.sections) {
    out.push(`### ${s.title}`, '', `*${s.eyebrow}${s.status !== 'done' ? ` · ${s.status}` : ''}*`, '');
    for (const block of s.blocks) out.push(...blockMd(block));
    if (s.gaps.length) out.push('**Gaps:**', ...s.gaps.map((g) => `- ${g}`), '');
    if (s.sources.length) out.push('**Sources:**', ...s.sources.map((src, i) => `${i + 1}. [${sourceLabel(src)}](${src.url})`), '');
  }
  return out;
}

function deepDiveMd(a: AnalysisResult): string[] {
  const e = a.enrichments ?? {};
  const out: string[] = ['## Deep Dive', ''];
  const lh = e.lighthouse;
  if (lh && !lh.error) {
    out.push('### Lighthouse (PageSpeed Insights)', '');
    out.push(...table(
      ['Strategy', 'Performance', 'Accessibility', 'Best practices', 'SEO', 'LCP (ms)', 'CLS', 'INP (ms)'],
      (['mobile', 'desktop'] as const).filter((k) => lh[k]).map((k) => {
        const r = lh[k]!;
        return [k, fmt(r.scores.performance), fmt(r.scores.accessibility), fmt(r.scores.bestPractices), fmt(r.scores.seo), fmt(r.vitals.lcpMs), r.vitals.cls ?? '–', fmt(r.vitals.inpMs)];
      }),
    ));
    const opps = lh.mobile?.opportunities ?? lh.desktop?.opportunities ?? [];
    if (opps.length) out.push('**Top opportunities:**', ...opps.slice(0, 8).map((o) => `- ${o.title}${o.savingsMs ? ` (~${fmt(o.savingsMs)} ms)` : ''}`), '');
  }
  const t = e.traffic;
  if (t) {
    out.push('### Traffic', '');
    const s = t.semrush;
    const rows: unknown[][] = [];
    if (t.trancoRank) rows.push(['Tranco rank', fmt(t.trancoRank)]);
    if (s) {
      if (s.visits) rows.push(['Monthly visits', fmt(s.visits)]);
      if (s.uniqueVisitors) rows.push(['Unique visitors', fmt(s.uniqueVisitors)]);
      if (s.pagesPerVisit) rows.push(['Pages per visit', s.pagesPerVisit.toFixed(2)]);
      if (s.bounceRatePct !== undefined) rows.push(['Bounce rate', `${s.bounceRatePct.toFixed(1)}%`]);
      if (s.avgVisitDurationSec) rows.push(['Avg. visit duration', `${Math.round(s.avgVisitDurationSec)} s`]);
      if (s.organicTraffic) rows.push(['Organic traffic (est.)', fmt(s.organicTraffic)]);
      if (s.organicKeywords) rows.push(['Organic keywords', fmt(s.organicKeywords)]);
      if (s.displayDate) rows.push(['Data month', s.displayDate]);
    }
    if (rows.length) out.push(...table(['Metric', 'Value'], rows));
    if (s?.topCountries.length) out.push(...table(['Country', 'Share'], s.topCountries.map((c) => [c.country, `${c.sharePct.toFixed(1)}%`])));
  }
  const apps = e.mobileApps?.apps ?? [];
  if (apps.length) {
    out.push('### Mobile Apps', '');
    out.push(...table(['App', 'Store', 'Publisher', 'Rating', 'Version', 'Last updated'], apps.map((p) => [p.name, p.store, p.publisher ?? '', p.rating ? `${p.rating.toFixed(1)} (${fmt(p.ratingCount)})` : '', p.version ?? '', p.lastUpdated ?? ''])));
  }
  const em = e.evidenceMatrix;
  if (em) {
    out.push('### Evidence Matrix (TechStack × ObservePoint)', '');
    out.push(`Agreement rate: ${em.stats.agreementRate === null ? '–' : `${Math.round(em.stats.agreementRate)}%`} · confirmed ${em.stats.confirmed} · TechStack only ${em.stats.techstackOnly} · ObservePoint only ${em.stats.observepointOnly}`, '');
    out.push(...table(['Technology', 'Building block', 'Status', 'Confidence'], em.rows.map((r) => [r.technology, r.buildingBlock ?? '', r.status, `${Math.round(r.confidence * 100)}%`])));
  }
  return out.length > 2 ? out : [];
}

function observePointMd(a: AnalysisResult): string[] {
  const op = a.enrichments?.observepoint;
  if (!op) return [];
  const out: string[] = ['## ObservePoint', ''];
  out.push(`Status: ${op.status}${op.pagesScanned ? ` · ${op.pagesScanned} pages scanned` : ''}${op.runCompletedAt ? ` · run ${op.runCompletedAt.slice(0, 10)}` : ''}${op.note ? ` · ${op.note}` : ''}`, '');
  if (op.tags.length) out.push(...table(['Tag', 'Category', 'Pages', 'Accounts'], op.tags.map((t) => [t.name, t.category, t.pagesPresent, (t.accounts ?? []).join(', ')])));
  const ins = op.insights;
  if (ins?.adobeFootprint) {
    const f = ins.adobeFootprint;
    out.push('### Adobe footprint', '');
    out.push(...table(['Item', 'Value'], [
      ['IMS Org IDs', f.imsOrgIds.join(', ')],
      ['Report suites', f.reportSuites.join(', ')],
      ['Tracking servers', f.trackingServers.join(', ')],
      ['Target client codes', f.targetClientCodes.join(', ')],
      ['Web SDK / AppMeasurement', `${f.webSdk ? 'Web SDK' : ''}${f.webSdk && f.appMeasurement ? ' + ' : ''}${f.appMeasurement ? 'AppMeasurement' : ''}`],
      ['eVars / props', `${f.evarCount ?? '–'} / ${f.propCount ?? '–'}`],
    ]));
  }
  if (ins?.findings.length) {
    out.push('### Findings', '');
    out.push(...table(['Severity', 'Finding', 'Evidence', 'Adobe angle', 'Products'], ins.findings.map((f) => [f.severity, f.title, f.evidence, f.adobeAngle, f.adobeProducts.join(', ')])));
  }
  if (ins?.versions?.upgrades.length) {
    out.push('### Upgrade opportunities', '');
    out.push(...table(['Upgrade', 'Evidence', 'Recommendation'], ins.versions.upgrades.map((u) => [u.title, u.evidence, u.recommendation])));
  }
  return out;
}

function geoMd(a: AnalysisResult): string[] {
  const g = a.enrichments?.geo;
  if (!g) return [];
  const out: string[] = ['## GEO Score (AI visibility)', ''];
  out.push(`**GEO score:** ${g.geoScore}/100 · AI visibility ${g.aiVisibility}% · share of voice ${g.shareOfVoicePct}% · ${g.marketPosition} · ${g.brand} (${g.country}, ${g.industry}) · model ${g.model}`, '');
  out.push(...table(['Component', 'Score'], Object.entries(g.components).map(([k, v]) => [k, v])));
  if (g.funnel.length) out.push(...table(['Stage', 'Queries', 'Mentions', 'Visibility'], g.funnel.map((f) => [f.stage, f.queries, f.mentions, `${f.visibilityPct}%`])));
  if (g.competitors.length) out.push(...table(['Competitor', 'Mentions', 'Visibility'], g.competitors.map((c) => [c.name, c.mentions, `${c.visibilityPct}%`])));
  if (g.queries.length) out.push('### Queries', '', ...table(['Query', 'Stage', 'Brand mentioned', 'Competitors', 'Sentiment'], g.queries.map((q) => [q.query, q.stage, q.brandMentioned ? 'yes' : 'no', q.competitorsMentioned.join(', '), q.sentiment ?? ''])));
  if (g.recommendations.length) out.push('### Recommendations', '', ...g.recommendations.map((r) => `- ${r}`), '');
  if (g.methodologyNote) out.push(`*${g.methodologyNote}*`, '');
  return out;
}

function licenseMd(a: AnalysisResult): string[] {
  const { estimates, edited } = currentLicenseEstimates(a);
  if (!estimates.length) return [];
  return [
    '## License Sizing (indicative)',
    '',
    `*Indicative estimate, not a quote${edited ? ' · includes assumptions edited in the License Sizing tab' : ' · default assumptions'}.*`,
    '',
    ...table(['Product', 'Metric', 'Low', 'Mid', 'High', 'License unit', 'Confidence', 'Detected today'], estimates.map((e) => [e.product, `${e.metric} (${e.unit})`, compact(e.low), compact(e.mid), compact(e.high), `${e.licenseUnit}${e.licenseUnits ? ` · ${e.licenseUnits.toLocaleString('en-US')} units` : ''}`, e.confidence, e.detected.join(', ')])),
  ];
}

/** Komplettreport: Pre-Briefing + alle Tabs der Ergebnisseite. */
export function generateMarkdown({ analysis: result, briefing }: FullReportData): string {
  const lines: string[] = [];
  const dateStr = new Date(result.analyzedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  lines.push(`# Account Radar — ${hostnameOf(result)}`, '');
  lines.push(`**URL:** ${result.finalUrl || result.url}  `, `**Analyzed:** ${dateStr}`, '');
  if (!briefing) lines.push('> No Client Pre-Briefing available for this analysis.', '');

  if (briefing) lines.push(...briefingMd(briefing));

  lines.push('## Summary', '', result.summary, '');

  lines.push('## Current Technology Stack', '');
  lines.push(...table(['Category', 'Current Technology', 'Challenges & Pain Points'], result.categories.map((c) => [c.category, c.currentTechnology, c.challengesAndPainPoints])));

  const opps = adobeOpportunities(result);
  if (opps.length) {
    lines.push('## Adobe Opportunities', '');
    lines.push(...table(['Category', 'Current', 'Adobe opportunity', 'Pain points'], opps.map((c) => [c.category, c.currentTechnology, c.adobeOpportunity, c.challengesAndPainPoints])));
  }

  const uc = result.useCaseDiscovery;
  if (uc?.useCases.length) {
    lines.push('## Use Cases', '');
    if (meaningful(uc.summary)) lines.push(`*${uc.summary}*`, '');
    for (const u of [...uc.useCases].sort((x, y) => x.rank - y.rank)) {
      lines.push(`### ${u.rank}. ${u.title}`, '', u.description, '');
      if (u.adobeProducts.length) lines.push(`- **Adobe products:** ${u.adobeProducts.join(', ')}`);
      if (meaningful(u.businessValue)) lines.push(`- **Business value:** ${u.businessValue}`);
      if (meaningful(u.quantifiedRoi)) lines.push(`- **Quantified ROI:** ${u.quantifiedRoi}`);
      if (meaningful(u.industryBenchmark)) lines.push(`- **Industry benchmark:** ${u.industryBenchmark}`);
      const prio = [u.impact && `Impact: ${u.impact}`, u.effort && `Effort: ${u.effort}`, meaningful(u.timeToValue) && `Time to value: ${u.timeToValue}`].filter(Boolean);
      if (prio.length) lines.push(`- **Prioritization:** ${prio.join(' · ')}`);
      if (meaningful(u.implementationHint)) lines.push(`- **Implementation hint:** ${u.implementationHint}`);
      if (u.evidence?.findings.length) lines.push(`- **Evidence (${u.evidence.source}):** ${u.evidence.findings.join('; ')}`);
      lines.push('');
    }
  }

  const integrations = integrationDetections(result);
  if (integrations.length) {
    lines.push('## Tech Case — Integration Landscape', '');
    lines.push(...table(['3rd-party system', 'Type', 'Confidence'], integrations.map((t) => [`${t.name}${t.version ? ` v${t.version}` : ''}`, t.categories.join(', '), t.weak ? 'unverified' : `${t.confidence}%`])));
  }

  lines.push(...deepDiveMd(result), ...observePointMd(result), ...geoMd(result), ...licenseMd(result));

  if (result.rawDetections.length) {
    lines.push('## Detected Technologies (Automated Scan)', '');
    lines.push(...table(['Technology', 'Version', 'Categories', 'Confidence'], result.rawDetections.map((t) => [t.name, t.version ?? '', t.categories.join(', '), t.weak ? 'unverified' : `${t.confidence}%`])));
  }

  lines.push('---', '*Generated by Account Radar (TechStack Analyzer)*');
  return lines.join('\n');
}

export function downloadMarkdown(data: FullReportData): void {
  // Data-URL statt Blob – funktioniert auch über HTTP (kein "insecure blob" Fehler)
  triggerDownload('data:text/markdown;charset=utf-8,' + encodeURIComponent(generateMarkdown(data)), exportFilename(data.analysis, 'md'));
}

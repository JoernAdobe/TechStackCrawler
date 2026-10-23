import * as XLSX from 'xlsx';
import { BRIEFING_CREDIT } from '../types/briefing';
import { currentLicenseEstimates } from './licenseSizing';
import { adobeOpportunities, integrationDetections } from './techCaseMarkdown';
import { blockToLines, exportFilename, hostnameOf, sourceLabel, type FullReportData } from './fullReport';

type Row = Record<string, string | number | null | undefined>;

function addSheet(wb: XLSX.WorkBook, name: string, rows: Row[]): void {
  if (!rows.length) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  const headers = Object.keys(rows[0]);
  ws['!cols'] = headers.map((h) => ({
    wch: Math.min(80, Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length)) + 2),
  }));
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

/** Komplettreport als Arbeitsmappe: Pre-Briefing + alle Tabs der Ergebnisseite. */
export function buildWorkbook({ analysis: a, briefing: b }: FullReportData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const e = a.enrichments ?? {};

  const overview: Row[] = [
    { Field: 'Account', Value: hostnameOf(a) },
    { Field: 'URL', Value: a.finalUrl || a.url },
    { Field: 'Analyzed', Value: a.analyzedAt },
    { Field: 'Summary', Value: a.summary },
  ];
  if (b) {
    const ex = b.executive;
    overview.push(
      { Field: 'Company', Value: b.companyName },
      { Field: 'Overall Pre-Briefing Score', Value: ex.overallScore },
      { Field: 'Priority', Value: ex.band },
      { Field: 'Confidence', Value: ex.confidence },
      { Field: 'Verdict', Value: ex.verdict },
      ...ex.bullets.map((x) => ({ Field: x.label, Value: x.text })),
      { Field: 'Pre-Briefing generated', Value: b.generatedAt },
      { Field: 'Credit', Value: BRIEFING_CREDIT },
    );
  } else {
    overview.push({ Field: 'Client Pre-Briefing', Value: 'Not available' });
  }
  addSheet(wb, 'Overview', overview);

  if (b) {
    addSheet(wb, 'Pre-Briefing Scores', b.executive.subScores.map((s) => ({
      Dimension: s.label, Weight: `${Math.round(s.weight * 100)}%`, Score: s.value ?? 'not assessed', Kind: s.kind, Rationale: s.rationale,
    })));
    addSheet(wb, 'Pre-Briefing Plays', b.executive.topPlays.map((p) => ({ Product: p.product, Play: p.headline, 'Based on': p.basedOn })));
    addSheet(wb, 'Pre-Briefing Sections', b.sections.flatMap((s) => [
      ...s.blocks.flatMap((blk) => blockToLines(blk).map((text) => ({ Section: s.title, Status: s.status, Type: blk.type, Content: text }))),
      ...s.gaps.map((g) => ({ Section: s.title, Status: s.status, Type: 'gap', Content: g })),
    ]));
    addSheet(wb, 'Pre-Briefing Sources', b.sections.flatMap((s) => s.sources.map((src) => ({
      Section: s.title, Source: sourceLabel(src), URL: src.url, Independent: src.independent ? 'yes' : 'no',
    }))));
  }

  addSheet(wb, 'Tech Stack', a.categories.map((c) => ({
    Category: c.category, 'Current Technology': c.currentTechnology, 'Challenges & Pain Points': c.challengesAndPainPoints, 'Adobe Opportunity': c.adobeOpportunity,
  })));
  addSheet(wb, 'Opportunities', adobeOpportunities(a).map((c) => ({
    Category: c.category, Current: c.currentTechnology, 'Adobe Opportunity': c.adobeOpportunity, 'Pain Points': c.challengesAndPainPoints,
  })));
  addSheet(wb, 'Use Cases', [...(a.useCaseDiscovery?.useCases ?? [])].sort((x, y) => x.rank - y.rank).map((u) => ({
    Rank: u.rank, Title: u.title, Description: u.description, 'Adobe Products': u.adobeProducts.join(', '),
    'Business Value': u.businessValue, 'Quantified ROI': u.quantifiedRoi, 'Industry Benchmark': u.industryBenchmark,
    Impact: u.impact, Effort: u.effort, 'Time to Value': u.timeToValue, 'Implementation Hint': u.implementationHint,
    Evidence: u.evidence?.findings.join('; '),
  })));
  addSheet(wb, 'Tech Case Integrations', integrationDetections(a).map((t) => ({
    System: t.name, Version: t.version, Type: t.categories.join(', '), Confidence: t.weak ? 'unverified' : t.confidence,
  })));

  const lh = e.lighthouse;
  if (lh && !lh.error) {
    addSheet(wb, 'Lighthouse', (['mobile', 'desktop'] as const).filter((k) => lh[k]).map((k) => {
      const r = lh[k]!;
      return {
        Strategy: k, Performance: r.scores.performance, Accessibility: r.scores.accessibility, 'Best Practices': r.scores.bestPractices,
        SEO: r.scores.seo, 'LCP ms': r.vitals.lcpMs, CLS: r.vitals.cls, 'INP ms': r.vitals.inpMs, 'FCP ms': r.vitals.fcpMs, 'TBT ms': r.vitals.tbtMs,
      };
    }));
  }
  const s = e.traffic?.semrush;
  if (e.traffic) {
    addSheet(wb, 'Traffic', [
      { Metric: 'Tranco rank', Value: e.traffic.trancoRank },
      { Metric: 'Monthly visits', Value: s?.visits },
      { Metric: 'Unique visitors', Value: s?.uniqueVisitors },
      { Metric: 'Pages per visit', Value: s?.pagesPerVisit },
      { Metric: 'Bounce rate %', Value: s?.bounceRatePct },
      { Metric: 'Avg. visit duration s', Value: s?.avgVisitDurationSec },
      { Metric: 'Organic traffic', Value: s?.organicTraffic },
      { Metric: 'Organic keywords', Value: s?.organicKeywords },
      { Metric: 'Data month', Value: s?.displayDate },
      ...(s?.topCountries ?? []).map((c) => ({ Metric: `Country share: ${c.country}`, Value: c.sharePct })),
    ].filter((r) => r.Value !== undefined && r.Value !== null));
  }
  addSheet(wb, 'Mobile Apps', (e.mobileApps?.apps ?? []).map((p) => ({
    App: p.name, Store: p.store, Publisher: p.publisher, Rating: p.rating, Ratings: p.ratingCount, Version: p.version, 'Last Updated': p.lastUpdated, URL: p.storeUrl,
  })));
  addSheet(wb, 'Evidence Matrix', (e.evidenceMatrix?.rows ?? []).map((r) => ({
    Technology: r.technology, 'Building Block': r.buildingBlock, Status: r.status, Confidence: Math.round(r.confidence * 100), Adobe: r.isAdobe ? 'yes' : 'no',
  })));

  const op = e.observepoint;
  addSheet(wb, 'ObservePoint Tags', (op?.tags ?? []).map((t) => ({
    Tag: t.name, Category: t.category, Pages: t.pagesPresent, Accounts: (t.accounts ?? []).join(', '),
  })));
  addSheet(wb, 'ObservePoint Findings', [
    ...(op?.insights?.findings ?? []).map((f) => ({
      Type: f.type, Severity: f.severity, Finding: f.title, Evidence: f.evidence, 'Adobe Angle': f.adobeAngle, Products: f.adobeProducts.join(', '),
    })),
    ...(op?.insights?.versions?.upgrades ?? []).map((u) => ({
      Type: 'upgrade', Severity: u.severity, Finding: u.title, Evidence: u.evidence, 'Adobe Angle': u.recommendation, Products: u.adobeProducts.join(', '),
    })),
  ]);

  const g = e.geo;
  if (g) {
    addSheet(wb, 'GEO Score', [
      { Metric: 'GEO score', Value: g.geoScore },
      { Metric: 'AI visibility %', Value: g.aiVisibility },
      { Metric: 'Share of voice %', Value: g.shareOfVoicePct },
      { Metric: 'Market position', Value: g.marketPosition },
      { Metric: 'Brand / country / industry', Value: `${g.brand} / ${g.country} / ${g.industry}` },
      { Metric: 'Model', Value: g.model },
      ...Object.entries(g.components).map(([k, v]) => ({ Metric: `Component: ${k}`, Value: v })),
      ...g.funnel.map((f) => ({ Metric: `Funnel: ${f.stage}`, Value: `${f.visibilityPct}% (${f.mentions}/${f.queries})` })),
      ...g.competitors.map((c) => ({ Metric: `Competitor: ${c.name}`, Value: `${c.visibilityPct}% (${c.mentions} mentions)` })),
      ...g.recommendations.map((r, i) => ({ Metric: `Recommendation ${i + 1}`, Value: r })),
    ]);
    addSheet(wb, 'GEO Queries', g.queries.map((q) => ({
      Query: q.query, Stage: q.stage, 'Brand Mentioned': q.brandMentioned ? 'yes' : 'no', Competitors: q.competitorsMentioned.join(', '), Sentiment: q.sentiment,
    })));
  }

  const { estimates } = currentLicenseEstimates(a);
  addSheet(wb, 'License Sizing', estimates.map((x) => ({
    Product: x.product, Metric: x.metric, Unit: x.unit, Low: x.low, Mid: x.mid, High: x.high,
    'License Unit': x.licenseUnit, 'License Units (mid)': x.licenseUnits, Confidence: x.confidence,
    Formula: x.formula, 'Detected Today': x.detected.join(', '), Source: x.sourceUrl,
  })));

  addSheet(wb, 'Detections', a.rawDetections.map((d) => ({
    Name: d.name, Version: d.version ?? '', Categories: d.categories.join(', '), Confidence: d.confidence, Weak: d.weak ? 'yes' : '',
  })));
  return wb;
}

export function downloadExcel(data: FullReportData): void {
  XLSX.writeFile(buildWorkbook(data), exportFilename(data.analysis, 'xlsx'));
}

/**
 * PowerPoint-Export (EAA "generate_pptx"-Parität) für Einzelanalysen und Batch-/Account-Assessments.
 */
import type PptxGenJS from 'pptxgenjs';
import type { AnalysisResult, CategoryResult, UseCaseItem } from '../types/analysis.js';
import type { BatchJob, GeoScoreResult, LighthouseResult, MobileAppsResult, TrafficResult } from '../types/parity.js';
import { isAdobeSolution } from '../data/buildingBlocks.js';
import { buildSolutionMatrix } from './keyFindings.js';
import {
  BRAND,
  CHART_COLORS,
  CONTENT,
  FONT,
  addBrandTable,
  addBulletList,
  addContentSlide,
  addCoverSlide,
  addEndSlide,
  addKeyFindingsDetailSlides,
  addOtherTechnologiesSlide,
  addParagraph,
  addSolutionMatrixSlides,
  addStatCards,
  chunk,
  clean,
  createDeck,
  deckToBuffer,
  formatDate,
  headerRow,
  hostnameOf,
  textCell,
} from './deckSlides.js';

const MAX_CATEGORIES = 8;
const fmtInt = (n?: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—');
const fmtScore = (n: number | null | undefined) => (typeof n === 'number' ? String(Math.round(n)) : '—');

function fmtDuration(sec?: number): string {
  if (typeof sec !== 'number' || !Number.isFinite(sec)) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m}m ${s}s` : `${s}s`;
}

// ── Einzelanalyse ─────────────────────────────────────────────────────────

function addCategorySlides(pptx: PptxGenJS, categories: CategoryResult[]): void {
  const list = categories.slice(0, MAX_CATEGORIES);
  const parts = chunk(list, 2);
  parts.forEach((pair, idx) => {
    const slide = addContentSlide(pptx, 'Category Assessment', parts.length > 1 ? `Part ${idx + 1} of ${parts.length}` : undefined);
    const colW = (CONTENT.w - 0.3) / 2;
    pair.forEach((c, i) => {
      const x = CONTENT.x + i * (colW + 0.3);
      slide.addShape('rect', { x, y: CONTENT.y, w: colW, h: 0.5, fill: { color: BRAND.black }, line: { color: BRAND.black, width: 0 } });
      slide.addText(clean(c.category, 60), {
        x: x + 0.15, y: CONTENT.y, w: colW - 0.3, h: 0.5, fontFace: FONT, fontSize: 15, bold: true, color: BRAND.white, valign: 'middle',
      });
      const sections: Array<[string, string, number]> = [
        ['Current technology', c.currentTechnology, 220],
        ['Challenges & pain points', c.challengesAndPainPoints, 520],
        ['Adobe opportunity', c.adobeOpportunity, 520],
      ];
      slide.addText(
        sections.flatMap(([label, value, max]) => [
          { text: label, options: { bold: true, color: label === 'Adobe opportunity' ? BRAND.red : BRAND.black, fontSize: 12, breakLine: true } },
          { text: clean(value, max) || '—', options: { color: BRAND.grayDark, fontSize: 11, breakLine: true, paraSpaceAfter: 8 } },
        ]),
        { x, y: CONTENT.y + 0.6, w: colW, h: CONTENT.h - 0.6, fontFace: FONT, valign: 'top', fit: 'shrink' },
      );
    });
  });
}

function addUseCaseSlides(pptx: PptxGenJS, useCases: UseCaseItem[], summary?: string): void {
  if (!useCases.length) return;
  const parts = chunk([...useCases].sort((a, b) => a.rank - b.rank).slice(0, 10), 5);
  parts.forEach((part, idx) => {
    const slide = addContentSlide(pptx, 'Use Case Recommendations', idx === 0 && summary ? clean(summary, 170) : `Part ${idx + 1} of ${parts.length}`);
    const rows = [
      headerRow(['#', 'Use Case', 'Adobe Products', 'Business Value', 'Effort / Impact']),
      ...part.map((u) => [
        textCell(String(u.rank), { bold: true, color: BRAND.red }),
        { text: [
          { text: clean(u.title, 90), options: { bold: true, breakLine: true } },
          { text: clean(u.description, 220), options: { color: BRAND.grayDark, fontSize: 9 } },
        ], options: { valign: 'top' as const } },
        textCell(u.adobeProducts.join(', ')),
        textCell([u.businessValue, u.quantifiedRoi].filter(Boolean).join(' — '), { fontSize: 9 }),
        textCell([u.effort && `Effort: ${u.effort}`, u.impact && `Impact: ${u.impact}`, u.timeToValue && `TTV: ${u.timeToValue}`].filter(Boolean).join('\n') || '—', { fontSize: 9 }),
      ]),
    ];
    addBrandTable(slide, rows, { colW: [0.5, 4.3, 2.4, 3.3, 1.8], fontSize: 10 });
  });
}

function addLighthouseSlide(pptx: PptxGenJS, lh: LighthouseResult): void {
  if (!lh.mobile && !lh.desktop) return;
  const slide = addContentSlide(pptx, 'Site Performance (Lighthouse)', `Google PageSpeed Insights · ${clean(lh.url, 100)}`);
  const strategies = [['Mobile', lh.mobile], ['Desktop', lh.desktop]] as const;
  const scoreCell = (v: number | null | undefined) =>
    textCell(fmtScore(v), { bold: true, align: 'center', color: typeof v === 'number' && v < 50 ? BRAND.red : BRAND.black });
  const metric = (label: string, pick: (s: NonNullable<LighthouseResult['mobile']>) => number | null | undefined) => [
    textCell(label, { bold: true, fill: { color: BRAND.grayBg } }),
    ...strategies.map(([, s]) => scoreCell(s ? pick(s) : null)),
  ];
  const vital = (label: string, pick: (s: NonNullable<LighthouseResult['mobile']>) => string | undefined) => [
    textCell(label, { bold: true, fill: { color: BRAND.grayBg } }),
    ...strategies.map(([, s]) => textCell((s && pick(s)) || '—', { align: 'center' })),
  ];
  const ms = (v?: number) => (typeof v === 'number' ? `${(v / 1000).toFixed(1)} s` : undefined);
  const rows = [
    headerRow(['Score / Metric', 'Mobile', 'Desktop']),
    metric('Performance', (s) => s.scores.performance),
    metric('Accessibility', (s) => s.scores.accessibility),
    metric('Best Practices', (s) => s.scores.bestPractices),
    metric('SEO', (s) => s.scores.seo),
    vital('LCP', (s) => ms(s.vitals.lcpMs)),
    vital('FCP', (s) => ms(s.vitals.fcpMs)),
    vital('CLS', (s) => (typeof s.vitals.cls === 'number' ? s.vitals.cls.toFixed(3) : undefined)),
    vital('TBT', (s) => (typeof s.vitals.tbtMs === 'number' ? `${Math.round(s.vitals.tbtMs)} ms` : undefined)),
  ];
  addBrandTable(slide, rows, { w: 6.2, colW: [2.6, 1.8, 1.8], fontSize: 11 });

  const opps = (lh.mobile?.opportunities ?? lh.desktop?.opportunities ?? []).slice(0, 6);
  if (opps.length) {
    slide.addText('Top opportunities', { x: 7.2, y: CONTENT.y, w: 5.7, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: BRAND.red });
    addBulletList(
      slide,
      opps.map((o) => (o.savingsMs ? `${o.title} (≈${(o.savingsMs / 1000).toFixed(1)} s)` : o.title)),
      { x: 7.2, y: CONTENT.y + 0.45, w: 5.7, h: 4.5 },
      12,
    );
  }
}

function addTrafficSlide(pptx: PptxGenJS, t: TrafficResult): void {
  const s = t.semrush;
  if (!s && typeof t.trancoRank !== 'number') return;
  const seo = s?.source === 'seo';
  const slide = addContentSlide(pptx, 'Traffic Insights', [seo ? 'Semrush organic search estimate' : s?.displayDate && `Semrush ${s.displayDate}`, t.sources.join(' + ')].filter(Boolean).join(' · '));
  const cards = [
    ...(s && seo ? [
      { label: 'Organic search traffic / mo (est.)', value: fmtInt(s.organicTraffic) },
      { label: 'Organic keywords', value: fmtInt(s.organicKeywords) },
      { label: 'Paid search traffic / mo (est.)', value: fmtInt(s.paidTraffic) },
    ] : []),
    ...(s && !seo ? [
      { label: 'Monthly visits', value: fmtInt(s.visits) },
      { label: 'Unique visitors', value: fmtInt(s.uniqueVisitors) },
      { label: 'Pages / visit', value: typeof s.pagesPerVisit === 'number' ? s.pagesPerVisit.toFixed(1) : '—' },
      { label: 'Bounce rate', value: typeof s.bounceRatePct === 'number' ? `${s.bounceRatePct.toFixed(0)}%` : '—' },
      { label: 'Avg. visit duration', value: fmtDuration(s.avgVisitDurationSec) },
    ] : []),
    ...(typeof t.trancoRank === 'number' ? [{ label: 'Global Tranco rank', value: `#${fmtInt(t.trancoRank)}` }] : []),
  ];
  const countries = (s?.topCountries ?? []).filter((c) => c.sharePct > 0).slice(0, 6);
  addStatCards(slide, cards, { x: CONTENT.x, y: CONTENT.y, w: countries.length ? 6.2 : CONTENT.w, perRow: 2, cardH: 1.05 });
  if (countries.length) {
    const rest = Math.max(0, 100 - countries.reduce((sum, c) => sum + c.sharePct, 0));
    const labels = [...countries.map((c) => clean(c.country, 30)), ...(rest >= 1 ? ['Other'] : [])];
    const values = [...countries.map((c) => Number(c.sharePct.toFixed(1))), ...(rest >= 1 ? [Number(rest.toFixed(1))] : [])];
    slide.addText(seo ? 'Top countries (share of organic search traffic)' : 'Top countries (share of traffic)', { x: 7.2, y: CONTENT.y, w: 5.7, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: BRAND.black });
    slide.addChart(pptx.ChartType.pie, [{ name: 'Traffic share', labels, values }], {
      x: 7.2, y: CONTENT.y + 0.45, w: 5.7, h: 4.6,
      chartColors: CHART_COLORS.slice(0, labels.length),
      showLegend: true, legendPos: 'r', legendFontFace: FONT, legendFontSize: 11,
      showPercent: true, showValue: false, dataLabelColor: BRAND.white, dataLabelFontFace: FONT, dataLabelFontSize: 10,
    });
  }
}

function addGeoSlide(pptx: PptxGenJS, g: GeoScoreResult): void {
  const slide = addContentSlide(pptx, 'AI Visibility (GEO)', `${clean(g.brand, 60)} · ${clean(g.country, 30)} · ${clean(g.industry, 50)} · model ${clean(g.model, 40)}`);
  addStatCards(slide, [
    { label: 'GEO score', value: `${Math.round(g.geoScore)}/100` },
    { label: 'AI visibility', value: `${Math.round(g.aiVisibility)}%` },
    { label: 'Share of voice', value: `${Math.round(g.shareOfVoicePct)}%` },
    { label: 'Market position', value: g.marketPosition },
  ], { x: CONTENT.x, y: CONTENT.y, w: 6.2, perRow: 2, cardH: 1.05 });
  const comps = g.competitors.slice(0, 5);
  if (comps.length) {
    addBrandTable(slide, [
      headerRow(['Competitor', 'Mentions', 'Visibility']),
      ...comps.map((c) => [textCell(c.name), textCell(String(c.mentions), { align: 'center' }), textCell(`${Math.round(c.visibilityPct)}%`, { align: 'center' })]),
    ], { x: CONTENT.x, y: CONTENT.y + 2.55, w: 6.2, colW: [3.4, 1.4, 1.4], fontSize: 10 });
  }
  slide.addText('Recommendations', { x: 7.2, y: CONTENT.y, w: 5.7, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: BRAND.red });
  addBulletList(slide, g.recommendations.slice(0, 6), { x: 7.2, y: CONTENT.y + 0.45, w: 5.7, h: 4.6 }, 12);
}

function addMobileAppsSlide(pptx: PptxGenJS, m: MobileAppsResult): void {
  if (!m.apps.length) return;
  const slide = addContentSlide(pptx, 'Mobile Apps', `${m.apps.length} app(s) found`);
  addBrandTable(slide, [
    headerRow(['Store', 'App', 'Publisher', 'Rating', 'Version / Updated']),
    ...m.apps.slice(0, 10).map((a) => [
      textCell(a.store === 'apple' ? 'App Store' : 'Google Play'),
      textCell(a.name, { bold: true }),
      textCell(a.publisher ?? '—'),
      textCell(typeof a.rating === 'number' ? `${a.rating.toFixed(1)}${a.ratingCount ? ` (${fmtInt(a.ratingCount)})` : ''}` : '—', { align: 'center' }),
      textCell([a.version, a.lastUpdated?.slice(0, 10)].filter(Boolean).join(' · ') || '—'),
    ]),
  ], { colW: [1.6, 3.8, 3.0, 1.6, 2.3], fontSize: 11 });
}

export async function buildAnalysisDeck(analysis: AnalysisResult): Promise<Buffer> {
  const domain = hostnameOf(analysis.finalUrl || analysis.url);
  const date = formatDate(new Date(analysis.analyzedAt || Date.now()));
  const pptx = createDeck(`${domain} · Tech Stack Assessment · ${date}`, `${domain} – Tech Stack Assessment`);

  addCoverSlide(pptx, { account: domain, title: 'Tech Stack Assessment', lines: [clean(analysis.url, 160), date] });

  const detections = analysis.rawDetections ?? [];
  const adobe = detections.filter((d) => isAdobeSolution(d.name));
  const summary = addContentSlide(pptx, 'Executive Summary', domain);
  const statsEnd = addStatCards(summary, [
    { label: 'Technologies detected', value: String(detections.length) },
    { label: 'Adobe solutions detected', value: String(adobe.length) },
    { label: 'Categories assessed', value: String(analysis.categories?.length ?? 0) },
    { label: 'Use cases identified', value: String(analysis.useCaseDiscovery?.useCases.length ?? 0) },
  ], { x: CONTENT.x, y: CONTENT.y, w: CONTENT.w, perRow: 4, cardH: 1.0 });
  addParagraph(summary, analysis.summary || 'No summary available.', { x: CONTENT.x, y: statsEnd + 0.3, w: CONTENT.w, h: 6.75 - statsEnd - 0.3 }, 14);

  const matrix = buildSolutionMatrix([{ url: analysis.url, label: domain, analysisId: analysis.id, detections }]);
  addSolutionMatrixSlides(pptx, matrix, { title: 'Solution Mapping' });

  if (analysis.categories?.length) addCategorySlides(pptx, analysis.categories);
  if (analysis.useCaseDiscovery?.useCases?.length) addUseCaseSlides(pptx, analysis.useCaseDiscovery.useCases, analysis.useCaseDiscovery.summary);

  const e = analysis.enrichments;
  if (e?.lighthouse && !e.lighthouse.error) addLighthouseSlide(pptx, e.lighthouse);
  if (e?.traffic) addTrafficSlide(pptx, e.traffic);
  if (e?.geo) addGeoSlide(pptx, e.geo);
  if (e?.mobileApps) addMobileAppsSlide(pptx, e.mobileApps);

  addOtherTechnologiesSlide(pptx, matrix.otherTechnologies);
  addEndSlide(pptx, [`Tech Stack Assessment for ${domain}`, `Generated ${formatDate()} by Tech Stack Analyzer`, 'Detections are based on publicly observable signals and should be validated with the customer.']);
  return deckToBuffer(pptx);
}

// ── Batch / Account ───────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = { queued: 'Queued', running: 'Running', done: 'Done', failed: 'Failed', skipped: 'Skipped' };

function addBatchOverviewSlides(pptx: PptxGenJS, batch: BatchJob): void {
  const items = batch.items ?? [];
  const parts = items.length ? chunk(items, 12) : [[]];
  parts.forEach((part, idx) => {
    const slide = addContentSlide(
      pptx,
      'Assessment Scope',
      `${batch.total} propert${batch.total === 1 ? 'y' : 'ies'} · ${batch.done} done · ${batch.failed} failed · status ${batch.status}${parts.length > 1 ? ` · part ${idx + 1}/${parts.length}` : ''}`,
    );
    if (!part.length) {
      addParagraph(slide, 'No properties in this assessment.', { x: CONTENT.x, y: CONTENT.y, w: CONTENT.w, h: 1 });
      return;
    }
    addBrandTable(slide, [
      headerRow(['#', 'URL', batch.lens ? `Label (${batch.lens})` : 'Label', 'Status', 'Technologies']),
      ...part.map((it, i) => [
        textCell(String(idx * 12 + i + 1), { align: 'center' }),
        textCell(clean(it.url, 90)),
        textCell(it.label ?? '—'),
        textCell(STATUS_LABEL[it.status] ?? it.status, { bold: true, color: it.status === 'failed' ? BRAND.red : BRAND.black }),
        textCell(it.detections ? String(it.detections.length) : '—', { align: 'center' }),
      ]),
    ], { colW: [0.6, 6.0, 2.8, 1.4, 1.5], fontSize: 10 });
  });
}

/** Fallback, falls batch.matrix (noch) nicht gespeichert ist: aus Item-Detektionen bauen. */
function matrixFor(batch: BatchJob) {
  if (batch.matrix) return batch.matrix;
  const inputs = (batch.items ?? [])
    .filter((it) => it.detections?.length)
    .map((it) => ({ url: it.url, label: it.label, analysisId: it.analysisId, detections: it.detections ?? [] }));
  return inputs.length ? buildSolutionMatrix(inputs) : null;
}

export async function buildBatchDeck(batch: BatchJob): Promise<Buffer> {
  const account = clean(batch.accountName || batch.title || 'Account', 80);
  const date = formatDate();
  const pptx = createDeck(`${account} · Experience Architecture Assessment · ${date}`, `${account} – Experience Architecture Assessment`);

  addCoverSlide(pptx, {
    account,
    title: 'Experience Architecture Assessment',
    lines: [
      batch.lens ? `Lens: ${batch.lens}` : '',
      batch.industry ? `Industry: ${batch.industry}` : '',
      date,
      batch.opportunityId ? `Opportunity: ${batch.opportunityId}` : '',
    ],
  });

  addBatchOverviewSlides(pptx, batch);

  const matrix = matrixFor(batch);
  if (matrix && matrix.columns.length) {
    addSolutionMatrixSlides(pptx, matrix, { title: 'Solution Mapping', maxCols: 5 });
    addKeyFindingsDetailSlides(pptx, matrix);
    addOtherTechnologiesSlide(pptx, matrix.otherTechnologies, 'Other / Unknown Solutions');
  } else {
    const slide = addContentSlide(pptx, 'Solution Mapping');
    addParagraph(slide, 'No detections available yet – the assessment has not produced results.', { x: CONTENT.x, y: CONTENT.y, w: CONTENT.w, h: 1 });
  }

  addEndSlide(pptx, [`Experience Architecture Assessment for ${account}`, `Generated ${date} by Tech Stack Analyzer`, 'Detections are based on publicly observable signals and should be validated with the customer.']);
  return deckToBuffer(pptx);
}

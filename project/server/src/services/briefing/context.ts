/**
 * TechStack-Fakten aus der bestehenden Analyse als autoritative Evidenz für einzelne Abschnitte
 * (s04–s11, s14) plus Footprint-Auswertung (Adobe vs. Wettbewerb je Building Block).
 */
import { buildingBlocksFor, isAdobeSolution } from '../../data/buildingBlocks.js';
import type { AnalysisResult } from '../../types/analysis.js';
import type { BriefingBlock, BriefingSection, BriefingSectionId, BriefingSource } from '../../types/briefing.js';
import { formatMonYear, hostOf } from './research/text.js';

export const SCAN_SOURCE_TITLE = 'TechStack Analyzer scan';
export const SCAN_SOURCE_PUBLISHER = 'Adobe TechStack Analyzer';
export const SCAN_SECTIONS: readonly BriefingSectionId[] = ['s04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's14'];

/**
 * Abschnitte, deren Kern der Analyzer misst. Ihre Kennzahlen kommen ausschließlich aus dem Scan
 * (feste Messwerte-Leiste), das Modell ergänzt nur Kontext, den der Scan nicht liefern kann.
 */
export const MEASURED_SECTIONS: readonly BriefingSectionId[] = ['s04', 's07'];

export function scanSource(analysis: AnalysisResult): BriefingSource {
  return {
    title: SCAN_SOURCE_TITLE,
    url: analysis.url,
    publisher: SCAN_SOURCE_PUBLISHER,
    date: formatMonYear(analysis.analyzedAt) ?? 'n.d.',
    independent: true,
  };
}

export interface BlockFootprint {
  block: string;
  adobe: string[];
  competitors: string[];
}

/** Starke (nicht-weak) Erkennungen je Building Block, zusätzlich bestätigte Evidence-Matrix-Zeilen. */
export function techFootprint(analysis: AnalysisResult): Map<string, BlockFootprint> {
  const out = new Map<string, BlockFootprint>();
  const add = (name: string, blocks: string[], isAdobe: boolean) => {
    for (const block of blocks) {
      const fp = out.get(block) ?? { block, adobe: [], competitors: [] };
      const list = isAdobe ? fp.adobe : fp.competitors;
      if (!list.includes(name)) list.push(name);
      out.set(block, fp);
    }
  };
  for (const d of analysis.rawDetections ?? []) {
    if (d.weak) continue;
    add(d.name, buildingBlocksFor(d.name, d.categories), isAdobeSolution(d.name));
  }
  for (const row of analysis.enrichments?.evidenceMatrix?.rows ?? []) {
    if (!row.buildingBlock) continue;
    add(row.technology, [row.buildingBlock], row.isAdobe);
  }
  return out;
}

const CONSENT_RE = /consent|cookie|onetrust|usercentrics|cookiebot|didomi|trustarc|quantcast choice|iubenda|sourcepoint|borlabs|cookieyes|privacy/i;

export function consentTechnologies(analysis: AnalysisResult): string[] {
  const names = new Set<string>();
  for (const d of analysis.rawDetections ?? []) {
    if (d.categories.some((c) => /consent/i.test(c)) || CONSENT_RE.test(d.name)) names.add(d.name);
  }
  const tool = analysis.enrichments?.observepoint?.insights?.privacy?.consentTool;
  if (tool?.name) names.add(tool.version ? `${tool.name} ${tool.version}` : tool.name);
  return [...names];
}

/** Alle Hosts aus Analyse-URL, Sitemap und Evidenz (für Client-Domains und s08). */
export function analysisHosts(analysis: AnalysisResult): string[] {
  const hosts = new Set<string>();
  for (const u of [analysis.url, analysis.finalUrl, ...(analysis.sitemapUrls ?? [])]) {
    const h = u ? hostOf(u) : '';
    if (h) hosts.add(h);
  }
  return [...hosts];
}

const fmtNum = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));

function detectionsBlock(analysis: AnalysisResult): string {
  const strong = (analysis.rawDetections ?? []).filter((d) => !d.weak);
  const lines = strong.slice(0, 60).map((d) => `- ${d.name} [${d.categories.join(', ')}]${isAdobeSolution(d.name) ? ' (Adobe)' : ''}`);
  const weak = (analysis.rawDetections ?? []).filter((d) => d.weak).map((d) => d.name);
  return [
    `Detected technologies (${strong.length} verified):`,
    ...lines,
    ...(weak.length ? [`Unverified single-signal detections (do not state as fact): ${weak.slice(0, 20).join(', ')}`] : []),
  ].join('\n');
}

function footprintBlock(analysis: AnalysisResult): string {
  const fp = [...techFootprint(analysis).values()];
  if (!fp.length) return '';
  return [
    'Footprint by building block (Adobe vs. other vendors):',
    ...fp.map((b) => `- ${b.block}: Adobe=${b.adobe.join(', ') || '–'}; other=${b.competitors.join(', ') || '–'}`),
  ].join('\n');
}

function observePointBlock(analysis: AnalysisResult): string {
  const op = analysis.enrichments?.observepoint;
  if (!op?.tags?.length) return '';
  const tags = [...op.tags].sort((a, b) => b.pagesPresent - a.pagesPresent).slice(0, 30);
  const fp = op.insights?.adobeFootprint;
  return [
    `ObservePoint tag audit (${op.pagesScanned ?? '?'} pages scanned${op.runCompletedAt ? `, ${formatMonYear(op.runCompletedAt)}` : ''}):`,
    ...tags.map((t) => `- ${t.name} [${t.category}] on ${t.pagesPresent} pages`),
    ...(fp
      ? [`Adobe footprint: Web SDK=${fp.webSdk ? 'yes' : 'no'}, AppMeasurement=${fp.appMeasurement ? 'yes' : 'no'}, Adobe tags=${fp.adobeTags.join(', ') || '–'}`]
      : []),
    ...(op.insights?.findings ?? []).slice(0, 6).map((f) => `- Finding (${f.severity}): ${f.title} – ${f.evidence}`),
  ].join('\n');
}

function evidenceBlock(analysis: AnalysisResult): string {
  const em = analysis.enrichments?.evidenceMatrix;
  if (!em?.rows?.length) return '';
  const confirmed = em.rows.filter((r) => r.status === 'confirmed').map((r) => r.technology);
  return `Evidence matrix: ${em.stats.confirmed} technologies confirmed by two scanners${confirmed.length ? ` (${confirmed.slice(0, 20).join(', ')})` : ''}; agreement rate ${em.stats.agreementRate ?? 'n/a'}.`;
}

export function searchBlock(analysis: AnalysisResult): string {
  const e = analysis.enrichments;
  const out: string[] = [];
  const t = e?.traffic;
  if (t) {
    const s = t.semrush;
    if (t.trancoRank) out.push(`Tranco global popularity rank: ${t.trancoRank}.`);
    if (s?.visits) out.push(`Semrush ${s.source === 'seo' ? 'estimated' : ''} monthly visits: ${fmtNum(s.visits)}${s.displayDate ? ` (${s.displayDate})` : ''}.`);
    if (s?.organicTraffic) out.push(`Semrush organic traffic/month: ${fmtNum(s.organicTraffic)}; organic keywords: ${fmtNum(s.organicKeywords ?? 0)}; paid traffic: ${fmtNum(s.paidTraffic ?? 0)}.`);
    if (s?.bounceRatePct !== undefined) out.push(`Bounce rate ${s.bounceRatePct}%, pages/visit ${s.pagesPerVisit ?? '?'}.`);
    if (s?.topCountries?.length) out.push(`Top countries: ${s.topCountries.slice(0, 6).map((c) => `${c.country} ${c.sharePct}%`).join(', ')}.`);
  }
  const lh = e?.lighthouse;
  for (const k of ['mobile', 'desktop'] as const) {
    const r = lh?.[k];
    if (r) out.push(`Lighthouse ${k}: performance ${r.scores.performance ?? 'n/a'}, SEO ${r.scores.seo ?? 'n/a'}, accessibility ${r.scores.accessibility ?? 'n/a'}${r.vitals.lcpMs ? `, LCP ${(r.vitals.lcpMs / 1000).toFixed(1)} s` : ''}.`);
  }
  const g = e?.geo;
  if (g) {
    out.push(`GEO / AI visibility (${g.model}, ${g.country}): GEO score ${g.geoScore}/100, AI visibility ${g.aiVisibility}%, share of voice ${g.shareOfVoicePct}%, position "${g.marketPosition}".`);
    if (g.competitors?.length) out.push(`AI answer competitors: ${g.competitors.slice(0, 5).map((c) => `${c.name} ${c.visibilityPct}%`).join(', ')}.`);
  }
  return out.length ? ['Search & performance measurements:', ...out].join('\n') : '';
}

export function portfolioBlock(analysis: AnalysisResult): string {
  const hosts = analysisHosts(analysis);
  const apps = analysis.enrichments?.mobileApps?.apps ?? [];
  const out: string[] = [];
  if (hosts.length) out.push(`Hosts seen in scan/sitemap: ${hosts.slice(0, 30).join(', ')}.`);
  if (analysis.sitemapUrls?.length) out.push(`Sitemap URLs found: ${analysis.sitemapUrls.length}.`);
  if (apps.length) {
    out.push('Mobile apps:');
    for (const a of apps.slice(0, 10)) out.push(`- ${a.name} (${a.store === 'apple' ? 'App Store' : 'Google Play'}${a.rating ? `, rating ${a.rating.toFixed(1)}` : ''}${a.ratingCount ? ` from ${fmtNum(a.ratingCount)} ratings` : ''}) ${a.storeUrl}`);
  }
  return out.length ? ['Web & app portfolio (from scan):', ...out].join('\n') : '';
}

function consentBlock(analysis: AnalysisResult): string {
  const names = consentTechnologies(analysis);
  const priv = analysis.enrichments?.observepoint?.insights?.privacy;
  const out: string[] = [];
  out.push(names.length ? `Consent / privacy technology detected: ${names.join(', ')}.` : 'No consent management platform detected by the scan.');
  if (priv?.googleConsentMode) out.push(`Google Consent Mode: ${priv.googleConsentMode.detected ? 'detected' : 'not detected'}.`);
  return ['Consent & privacy signals (from scan):', ...out].join('\n');
}

function adobeBlock(analysis: AnalysisResult): string {
  const out: string[] = [];
  const cats = analysis.categories ?? [];
  if (cats.length) {
    out.push('Analyzer category findings (current tech → Adobe opportunity):');
    for (const c of cats.slice(0, 14)) out.push(`- ${c.category}: current=${c.currentTechnology}; pain=${c.challengesAndPainPoints}; opportunity=${c.adobeOpportunity}`);
  }
  const uc = analysis.useCaseDiscovery?.useCases ?? [];
  if (uc.length) {
    out.push('Discovered use cases:');
    for (const u of uc.slice(0, 6)) out.push(`- ${u.title} (${u.adobeProducts.join(', ')}): ${u.businessValue}`);
  }
  return out.join('\n');
}

const MARKETING_RE = /advertis|marketing automation|esp|personali|optimi|a\/b|tag manag|analytics|crm|affiliate|retarget|customer data|cdp/i;
const SOCIAL_RE = /facebook|meta pixel|instagram|linkedin|tiktok|pinterest|twitter|x\.com|snapchat|reddit|youtube|xing|social/i;

function detectionsMatching(analysis: AnalysisResult, test: (name: string, categories: string[]) => boolean): string[] {
  return (analysis.rawDetections ?? [])
    .filter((d) => !d.weak && test(d.name, d.categories))
    .map((d) => `${d.name} [${d.categories.join(', ')}]${isAdobeSolution(d.name) ? ' (Adobe)' : ''}`);
}

function marketingBlock(analysis: AnalysisResult): string {
  const tools = detectionsMatching(analysis, (n, c) => c.some((x) => MARKETING_RE.test(x)) && !SOCIAL_RE.test(n));
  const s = analysis.enrichments?.traffic?.semrush;
  const out: string[] = [];
  if (tools.length) out.push('Marketing, advertising & analytics technology detected on the site:', ...tools.slice(0, 30).map((t) => `- ${t}`));
  if (s?.paidTraffic !== undefined) out.push(`Semrush paid search traffic/month: ${fmtNum(s.paidTraffic)}${s.organicTraffic ? ` vs. organic ${fmtNum(s.organicTraffic)}` : ''}.`);
  return out.join('\n');
}

function socialBlock(analysis: AnalysisResult): string {
  const tags = detectionsMatching(analysis, (n) => SOCIAL_RE.test(n));
  return tags.length ? ['Social platform pixels/widgets detected on the site:', ...tags.slice(0, 20).map((t) => `- ${t}`)].join('\n') : '';
}

function competitiveBlock(analysis: AnalysisResult): string {
  const g = analysis.enrichments?.geo;
  if (!g?.competitors?.length) return '';
  return [
    `Competitors in AI answers (GEO Score, ${g.model}, ${g.country}) – ${analysis.url} itself: ${g.aiVisibility}% visibility, position "${g.marketPosition}":`,
    ...g.competitors.slice(0, 8).map((c) => `- ${c.name}: ${c.visibilityPct}% AI visibility`),
  ].join('\n');
}

function marketBlock(analysis: AnalysisResult): string {
  const s = analysis.enrichments?.traffic?.semrush;
  const out: string[] = [];
  if (s?.visits) out.push(`Semrush monthly visits: ${fmtNum(s.visits)}${s.displayDate ? ` (${s.displayDate})` : ''}.`);
  if (s?.topCountries?.length) out.push(`Traffic by country: ${s.topCountries.slice(0, 8).map((c) => `${c.country} ${c.sharePct}%`).join(', ')}.`);
  const apps = analysis.enrichments?.mobileApps?.apps ?? [];
  if (apps.length) out.push(`Mobile apps: ${apps.slice(0, 6).map((a) => `${a.name}${a.ratingCount ? ` (${fmtNum(a.ratingCount)} ratings)` : ''}`).join(', ')}.`);
  return out.length ? ['Audience signals (from scan):', ...out].join('\n') : '';
}

/** Feste Kennzahlen aus dem Scan; identisch zu den Analyzer-Tabs (eine Datenbasis). */
export function measuredBlock(id: BriefingSectionId, analysis: AnalysisResult): BriefingBlock | null {
  const cards: Array<{ label: string; value: string; detail?: string }> = [];
  if (id === 's04') {
    const strong = (analysis.rawDetections ?? []).filter((d) => !d.weak);
    const adobe = strong.filter((d) => isAdobeSolution(d.name));
    if (strong.length) cards.push({ label: 'Verified technologies', value: String(strong.length), detail: `${adobe.length} Adobe, ${strong.length - adobe.length} other vendors (Tech Stack tab).` });
    const fp = [...techFootprint(analysis).values()];
    if (fp.length) {
      const withAdobe = fp.filter((b) => b.adobe.length);
      cards.push({ label: 'Adobe footprint', value: `${withAdobe.length} of ${fp.length} blocks`, detail: withAdobe.length ? `Adobe in ${withAdobe.map((b) => b.block).slice(0, 4).join(', ')}.` : 'No Adobe solution detected on the site.' });
      const open = fp.filter((b) => !b.adobe.length && b.competitors.length);
      cards.push({ label: 'Other-vendor blocks', value: String(open.length), detail: open.length ? open.slice(0, 3).map((b) => `${b.block}: ${b.competitors.slice(0, 2).join(', ')}`).join('; ') + '.' : 'Every detected block already runs Adobe.' });
    }
    const em = analysis.enrichments?.evidenceMatrix;
    const op = analysis.enrichments?.observepoint;
    if (em?.stats.confirmed) cards.push({ label: 'Confirmed by 2 scanners', value: String(em.stats.confirmed), detail: 'Evidence matrix (Deep Dive tab).' });
    else if (op?.tags?.length) cards.push({ label: 'ObservePoint tags', value: String(op.tags.length), detail: `${op.pagesScanned ?? '?'} pages audited (ObservePoint tab).` });
    else if (analysis.categories?.length) cards.push({ label: 'Categories with pain points', value: String(analysis.categories.length), detail: 'Opportunities tab.' });
  }
  if (id === 's07') {
    const e = analysis.enrichments;
    if (e?.geo) cards.push({ label: 'GEO score', value: `${e.geo.geoScore}/100`, detail: `${e.geo.aiVisibility}% AI visibility, ${e.geo.shareOfVoicePct}% share of voice (GEO Score tab).` });
    const s = e?.traffic?.semrush;
    if (s?.visits) cards.push({ label: 'Monthly visits', value: fmtNum(s.visits), detail: `Semrush${s.displayDate ? `, ${s.displayDate}` : ''}${s.organicTraffic ? `; organic ${fmtNum(s.organicTraffic)}/month` : ''}.` });
    else if (s?.organicTraffic) cards.push({ label: 'Organic traffic', value: `${fmtNum(s.organicTraffic)}/month`, detail: `Semrush; ${fmtNum(s.organicKeywords ?? 0)} organic keywords.` });
    else if (e?.traffic?.trancoRank) cards.push({ label: 'Tranco rank', value: `#${e.traffic.trancoRank}`, detail: 'Global popularity rank.' });
    const lh = e?.lighthouse?.mobile ?? e?.lighthouse?.desktop;
    if (lh?.scores.seo !== undefined && lh.scores.seo !== null) cards.push({ label: 'Lighthouse SEO', value: `${lh.scores.seo}/100`, detail: `${e?.lighthouse?.mobile ? 'Mobile' : 'Desktop'} audit of the home page.` });
    if (lh?.scores.performance !== undefined && lh.scores.performance !== null) cards.push({ label: 'Page performance', value: `${lh.scores.performance}/100`, detail: lh.vitals.lcpMs ? `LCP ${(lh.vitals.lcpMs / 1000).toFixed(1)} s.` : 'Lighthouse performance score.' });
  }
  const n = cards.length >= 4 ? 4 : cards.length >= 2 ? 2 : 0;
  return n ? { type: 'feature-grid', cards: cards.slice(0, n) } : null;
}

/** Setzt die Messwerte-Leiste hinter den Einleitungsabsatz und zitiert den Scan als Quelle. */
export function withMeasuredBlock(section: BriefingSection, analysis: AnalysisResult, scan: BriefingSource): BriefingSection {
  if (!MEASURED_SECTIONS.includes(section.id)) return section;
  const block = measuredBlock(section.id, analysis);
  if (!block) return section;
  const at = section.blocks[0]?.type === 'paragraph' ? 1 : 0;
  const blocks = [...section.blocks.slice(0, at), block, ...section.blocks.slice(at)];
  const sources = section.sources.some((s) => s.title === scan.title) ? section.sources : [...section.sources, scan];
  return { ...section, blocks, sources };
}

/** Faktenblock für einen Abschnitt; leer, wenn die Analyse dafür nichts beiträgt. */
export function techFactsFor(id: BriefingSectionId, analysis: AnalysisResult): string {
  const parts: string[] = [];
  switch (id) {
    case 's04':
      parts.push(detectionsBlock(analysis), footprintBlock(analysis), observePointBlock(analysis), evidenceBlock(analysis));
      break;
    case 's05':
      parts.push(marketingBlock(analysis));
      break;
    case 's06':
      parts.push(socialBlock(analysis));
      break;
    case 's07':
      parts.push(searchBlock(analysis));
      break;
    case 's09':
      parts.push(competitiveBlock(analysis));
      break;
    case 's10':
      parts.push(marketBlock(analysis));
      break;
    case 's08':
      parts.push(portfolioBlock(analysis));
      break;
    case 's11':
      parts.push(consentBlock(analysis));
      break;
    case 's14':
      parts.push(footprintBlock(analysis), adobeBlock(analysis));
      break;
    default:
      return '';
  }
  const body = parts.filter(Boolean).join('\n\n');
  return body ? `${body}\n\nAnalyzer summary: ${analysis.summary?.slice(0, 600) ?? ''}` : '';
}

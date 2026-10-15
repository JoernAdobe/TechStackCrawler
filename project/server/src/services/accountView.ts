/**
 * Account-Sicht über alle fertigen Items eines Account-/Bulk-Assessments:
 * Tech-Matrix, Fragmentierung, Adobe-Footprint, Rankings, Findings, Opportunities.
 * Rein funktional (keine I/O) – wird bei jedem getBatch() aus den Items berechnet.
 */
import { buildingBlocksFor, isAdobeSolution } from '../data/buildingBlocks.js';
import { findDisplacements } from '../data/displacementMap.js';
import type { BatchItem } from '../types/parity.js';
import type {
  AccountDomain,
  AccountFootprintRow,
  AccountFragmentation,
  AccountOpportunity,
  AccountTechRow,
  AccountUseCase,
  AccountView,
  BatchEnrichmentSource,
  BatchItemTraffic,
} from '../types/batchAccount.js';
import { aggregateFindings } from './accountFindings.js';

const MAX_TECH_ROWS = 80;
const MAX_OPPORTUNITIES = 10;
const MAX_USE_CASES = 15;
/** Gewicht für Domains ohne Traffic-Daten (damit sie in der Priorisierung nicht verschwinden). */
const UNKNOWN_TRAFFIC_WEIGHT = 0.3;

/** Building Block → naheliegendes Adobe-Produkt (nur Blöcke, in denen Adobe ein Angebot hat). */
export const BLOCK_PRODUCT: Record<string, string> = {
  CMS: 'Adobe Experience Manager Sites',
  DAM: 'Adobe Experience Manager Assets',
  'E-Commerce': 'Adobe Commerce',
  Analytics: 'Adobe Analytics / Customer Journey Analytics',
  'Tag Management': 'Adobe Experience Platform Tags',
  'Personalization & Optimization': 'Adobe Target',
  'Campaign Orchestration': 'Adobe Journey Optimizer / Marketo Engage',
  CDP: 'Adobe Real-Time CDP',
  DMP: 'Adobe Real-Time CDP',
  'Profile Resolution': 'Adobe Experience Platform Identity Service',
  Advertising: 'Adobe Advertising',
  'Digital Signature': 'Adobe Acrobat Sign',
};

/** Lückenfaktor, wenn in einem Block gar nichts erkannt wurde (nur gut erkennbare Blöcke zählen). */
const NONE_DETECTED_FACTOR: Record<string, number> = {
  Analytics: 0.6,
  'Tag Management': 0.5,
  'Personalization & Optimization': 0.5,
  CMS: 0.3,
  CDP: 0.25,
  'Campaign Orchestration': 0.25,
};

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 0–100 aus Tranco-Rang (1 → 100, 1 Mio → 0) und/oder Semrush-Visits (1k → 0, 1 Mrd → 100). */
export function trafficScore(t?: BatchItemTraffic): number | null {
  if (!t) return null;
  const scores: number[] = [];
  if (t.trancoRank && t.trancoRank > 0) scores.push(100 * (1 - Math.log10(t.trancoRank) / 6));
  if (t.visits && t.visits > 0) scores.push((100 * (Math.log10(t.visits) - 3)) / 6);
  if (!scores.length) return null;
  return Math.round(clamp(Math.max(...scores), 0, 100));
}

function weightOf(d: AccountDomain): number {
  return d.trafficScore === null ? UNKNOWN_TRAFFIC_WEIGHT : Math.max(0.05, d.trafficScore / 100);
}

interface DomainTech {
  name: string;
  blocks: string[];
  isAdobe: boolean;
}

function strongTechs(item: BatchItem): DomainTech[] {
  const seen = new Set<string>();
  const out: DomainTech[] = [];
  for (const d of item.detections ?? []) {
    if (d.weak || seen.has(d.name)) continue;
    seen.add(d.name);
    out.push({ name: d.name, blocks: buildingBlocksFor(d.name, d.categories), isAdobe: isAdobeSolution(d.name) });
  }
  return out;
}

function buildDomain(item: BatchItem, techs: DomainTech[]): AccountDomain {
  const e = item.enrichments ?? {};
  return {
    itemId: item.id,
    url: item.url,
    host: hostOf(item.url),
    ...(item.label ? { label: item.label } : {}),
    ...(item.analysisId ? { analysisId: item.analysisId } : {}),
    trafficScore: trafficScore(e.traffic),
    ...(e.traffic?.trancoRank !== undefined ? { trancoRank: e.traffic.trancoRank } : {}),
    ...(e.traffic?.visits !== undefined ? { visits: e.traffic.visits } : {}),
    techCount: techs.length,
    adobeCount: techs.filter((t) => t.isAdobe).length,
    ...(e.lighthouse ? { mobilePerformance: e.lighthouse.mobilePerformance } : {}),
    ...(e.geo ? { geoScore: e.geo.geoScore } : {}),
    ...(e.observepoint?.status === 'done' ? { opAgreement: e.observepoint.agreementRate } : {}),
    ...(e.mobileApps ? { mobileApps: e.mobileApps.count } : {}),
  };
}

function buildTechMatrix(techsPerDomain: DomainTech[][]): AccountTechRow[] {
  const rows = new Map<string, AccountTechRow>();
  techsPerDomain.forEach((techs, i) => {
    for (const t of techs) {
      let row = rows.get(t.name);
      if (!row) {
        row = {
          technology: t.name,
          ...(t.blocks[0] ? { buildingBlock: t.blocks[0] } : {}),
          isAdobe: t.isAdobe,
          presence: techsPerDomain.map(() => false),
          count: 0,
        };
        rows.set(t.name, row);
      }
      if (!row.presence[i]) {
        row.presence[i] = true;
        row.count++;
      }
    }
  });
  return [...rows.values()]
    .sort(
      (a, b) =>
        Number(Boolean(b.buildingBlock)) - Number(Boolean(a.buildingBlock)) ||
        b.count - a.count ||
        a.technology.localeCompare(b.technology),
    )
    .slice(0, MAX_TECH_ROWS);
}

interface BlockStats {
  /** Lösung → Anzahl Domains */
  solutions: Map<string, { isAdobe: boolean; domains: number }>;
  adobeDomains: Set<number>;
  competitorDomains: Set<number>;
}

function blockStats(techsPerDomain: DomainTech[][]): Map<string, BlockStats> {
  const stats = new Map<string, BlockStats>();
  techsPerDomain.forEach((techs, i) => {
    for (const t of techs) {
      for (const block of t.blocks) {
        let s = stats.get(block);
        if (!s) stats.set(block, (s = { solutions: new Map(), adobeDomains: new Set(), competitorDomains: new Set() }));
        const sol = s.solutions.get(t.name) ?? { isAdobe: t.isAdobe, domains: 0 };
        sol.domains++;
        s.solutions.set(t.name, sol);
        (t.isAdobe ? s.adobeDomains : s.competitorDomains).add(i);
      }
    }
  });
  return stats;
}

function buildFragmentation(stats: Map<string, BlockStats>): AccountFragmentation[] {
  return [...stats.entries()]
    .filter(([, s]) => s.solutions.size >= 2)
    .map(([buildingBlock, s]) => ({
      buildingBlock,
      solutions: [...s.solutions.entries()]
        .map(([name, v]) => ({ name, isAdobe: v.isAdobe, domains: v.domains }))
        .sort((a, b) => b.domains - a.domains || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.solutions.length - a.solutions.length || a.buildingBlock.localeCompare(b.buildingBlock));
}

function buildFootprint(stats: Map<string, BlockStats>): AccountFootprintRow[] {
  return Object.keys(BLOCK_PRODUCT).map((buildingBlock) => {
    const s = stats.get(buildingBlock);
    const solutions = s ? [...s.solutions.entries()] : [];
    const adobeDomains = s?.adobeDomains.size ?? 0;
    const competitorDomains = s?.competitorDomains.size ?? 0;
    const status: AccountFootprintRow['status'] =
      adobeDomains && competitorDomains ? 'mixed' : adobeDomains ? 'adobe' : competitorDomains ? 'competitor' : 'none';
    return {
      buildingBlock,
      adobe: solutions.filter(([, v]) => v.isAdobe).map(([n]) => n),
      competitors: solutions.filter(([, v]) => !v.isAdobe).map(([n]) => n),
      adobeDomains,
      competitorDomains,
      status,
    };
  });
}

function buildOpportunities(
  domains: AccountDomain[],
  techsPerDomain: DomainTech[][],
  stats: Map<string, BlockStats>,
): AccountOpportunity[] {
  if (domains.length === 0) return [];
  const out: AccountOpportunity[] = [];
  for (const [block, product] of Object.entries(BLOCK_PRODUCT)) {
    const s = stats.get(block);
    const competitors = s ? [...s.solutions.entries()].filter(([, v]) => !v.isAdobe).map(([n]) => n) : [];
    const fragmented = competitors.length >= 2;
    let raw = 0;
    const affected: Array<{ host: string; w: number }> = [];
    domains.forEach((d, i) => {
      const inBlock = techsPerDomain[i].filter((t) => t.blocks.includes(block));
      if (inBlock.some((t) => t.isAdobe)) return;
      const hasCompetitor = inBlock.length > 0;
      const gap = hasCompetitor ? (fragmented ? 1.25 : 1) : (NONE_DETECTED_FACTOR[block] ?? 0);
      if (gap <= 0) return;
      const w = weightOf(d);
      raw += w * gap;
      affected.push({ host: d.host, w: w * gap });
    });
    if (raw <= 0) continue;
    const displacement = findDisplacements(competitors)[0];
    const gapType: AccountOpportunity['gap'] = fragmented ? 'fragmented' : competitors.length ? 'competitor' : 'none-detected';
    const rationale =
      gapType === 'fragmented'
        ? `${competitors.length} different non-Adobe ${block} solutions across the account (${competitors.slice(0, 4).join(', ')}) – consolidation case for ${product}.`
        : gapType === 'competitor'
          ? displacement?.displacementRationale ?? `${competitors.join(', ')} in use – displacement case for ${product}.`
          : `No ${block} solution detected on ${affected.length} domain(s) – greenfield case for ${product}.`;
    out.push({
      buildingBlock: block,
      adobeProduct: displacement && gapType !== 'none-detected' ? displacement.adobeProduct : product,
      score: Math.round(clamp((100 * raw) / domains.length, 0, 100)),
      gap: gapType,
      competitors,
      domains: affected.sort((a, b) => b.w - a.w).slice(0, 10).map((a) => a.host),
      rationale,
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, MAX_OPPORTUNITIES);
}

const IMPACT_FACTOR: Record<string, number> = { High: 1, Medium: 0.7, Low: 0.4 };

function buildUseCases(items: BatchItem[], domains: AccountDomain[]): AccountUseCase[] {
  const byTitle = new Map<string, { title: string; products: Set<string>; domains: string[]; raw: number }>();
  items.forEach((item, i) => {
    for (const uc of item.enrichments?.useCases ?? []) {
      const key = uc.title.trim().toLowerCase();
      const entry = byTitle.get(key) ?? { title: uc.title.trim(), products: new Set<string>(), domains: [], raw: 0 };
      uc.adobeProducts.forEach((p) => entry.products.add(p));
      if (!entry.domains.includes(domains[i].host)) entry.domains.push(domains[i].host);
      entry.raw += weightOf(domains[i]) * (IMPACT_FACTOR[uc.impact ?? ''] ?? 0.6);
      byTitle.set(key, entry);
    }
  });
  return [...byTitle.values()]
    .map((e) => ({
      title: e.title,
      adobeProducts: [...e.products],
      domains: e.domains,
      score: Math.round(clamp((100 * e.raw) / domains.length, 0, 100)),
    }))
    .sort((a, b) => b.score - a.score || b.domains.length - a.domains.length)
    .slice(0, MAX_USE_CASES);
}

function sourceIssues(items: BatchItem[]): AccountView['sourceIssues'] {
  const map = new Map<BatchEnrichmentSource, { errors: number; skipped: number; sample?: string }>();
  for (const item of items) {
    const e = item.enrichments;
    for (const [kind, rec] of [['errors', e?.errors], ['skipped', e?.skipped]] as const) {
      for (const [source, msg] of Object.entries(rec ?? {})) {
        const s = map.get(source as BatchEnrichmentSource) ?? { errors: 0, skipped: 0 };
        s[kind]++;
        s.sample ??= msg;
        map.set(source as BatchEnrichmentSource, s);
      }
    }
  }
  return [...map.entries()].map(([source, s]) => ({ source, ...s }));
}

/** Baut die Account-Sicht aus allen erfolgreich verarbeiteten Items; null, wenn noch keines fertig ist. */
export function buildAccountView(allItems: BatchItem[], now = new Date()): AccountView | null {
  const items = allItems.filter((i) => i.status === 'done' && i.detections);
  if (items.length === 0) return null;
  const techsPerDomain = items.map(strongTechs);
  const domains = items.map((item, i) => buildDomain(item, techsPerDomain[i]));
  const stats = blockStats(techsPerDomain);
  const en = items.map((i) => i.enrichments ?? {});
  const count = (pred: (i: number) => boolean) => items.reduce((n, _, i) => n + (pred(i) ? 1 : 0), 0);

  return {
    generatedAt: now.toISOString(),
    domains,
    techMatrix: buildTechMatrix(techsPerDomain),
    fragmentation: buildFragmentation(stats),
    footprint: buildFootprint(stats),
    trafficRanking: domains
      .filter((d) => d.trafficScore !== null)
      .map((d) => ({ host: d.host, score: d.trafficScore as number, trancoRank: d.trancoRank, visits: d.visits }))
      .sort((a, b) => b.score - a.score),
    performanceRanking: items
      .map((_, i) => ({ host: domains[i].host, l: en[i].lighthouse }))
      .filter((x) => x.l)
      .map(({ host, l }) => ({
        host,
        mobile: l!.mobilePerformance,
        desktop: l!.desktopPerformance,
        ...(l!.lcpMs !== undefined ? { lcpMs: l!.lcpMs } : {}),
        ...(l!.cls !== undefined ? { cls: l!.cls } : {}),
        ...(l!.fieldCategory ? { fieldCategory: l!.fieldCategory } : {}),
      }))
      .sort((a, b) => (a.mobile ?? 101) - (b.mobile ?? 101)),
    geoRanking: items
      .map((_, i) => ({ host: domains[i].host, g: en[i].geo }))
      .filter((x) => x.g)
      .map(({ host, g }) => ({ host, brand: g!.brand, geoScore: g!.geoScore, aiVisibility: g!.aiVisibility, marketPosition: g!.marketPosition }))
      .sort((a, b) => b.geoScore - a.geoScore),
    observepoint: items
      .map((_, i) => ({ host: domains[i].host, op: en[i].observepoint }))
      .filter((x) => x.op)
      .map(({ host, op }) => ({
        host,
        status: op!.status,
        agreementRate: op!.agreementRate,
        confirmed: op!.confirmed,
        techstackOnly: op!.techstackOnly,
        observepointOnly: op!.observepointOnly,
        ...(op!.pagesScanned !== undefined ? { pagesScanned: op!.pagesScanned } : {}),
        conflicts: op!.conflicts,
      })),
    findings: aggregateFindings(items, domains.map((d) => d.host)),
    opportunities: buildOpportunities(domains, techsPerDomain, stats),
    useCases: buildUseCases(items, domains),
    coverage: {
      detections: items.length,
      traffic: count((i) => domains[i].trafficScore !== null),
      semrush: count((i) => en[i].traffic?.visits !== undefined),
      observepoint: count((i) => en[i].observepoint?.status === 'done'),
      mobileApps: count((i) => Boolean(en[i].mobileApps)),
      lighthouse: count((i) => Boolean(en[i].lighthouse)),
      geo: count((i) => Boolean(en[i].geo)),
      useCases: count((i) => Boolean(en[i].useCases?.length)),
    },
    sourceIssues: sourceIssues(allItems),
  };
}

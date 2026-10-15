/**
 * Verdichtet volle Enrichment-Ergebnisse auf kompakte Batch-Item-Werte
 * (batch_items.enrichments_json bleibt auch bei 1.000 Items klein).
 */
import type {
  EvidenceMatrix,
  GeoScoreResult,
  LighthouseResult,
  MobileAppsResult,
  ObservePointResult,
  TrafficResult,
} from '../types/parity.js';
import type { UseCaseDiscoveryResult } from '../types/analysis.js';
import type {
  BatchItemGeo,
  BatchItemLighthouse,
  BatchItemObservePoint,
  BatchItemTraffic,
  BatchItemEnrichments,
} from '../types/batchAccount.js';

const MAX_FINDINGS = 12;
const MAX_USE_CASES = 10;

export function compactTraffic(t: TrafficResult): BatchItemTraffic {
  return {
    sources: [...t.sources],
    ...(t.trancoRank !== undefined ? { trancoRank: t.trancoRank } : {}),
    ...(t.semrush?.visits !== undefined ? { visits: t.semrush.visits } : {}),
    ...(t.semrush?.uniqueVisitors !== undefined ? { uniqueVisitors: t.semrush.uniqueVisitors } : {}),
    ...(t.semrush?.topCountries?.[0] ? { topCountry: t.semrush.topCountries[0].country } : {}),
  };
}

export function compactLighthouse(l: LighthouseResult): BatchItemLighthouse | undefined {
  const main = l.mobile ?? l.desktop;
  if (!main) return undefined;
  const v = l.mobile?.vitals ?? l.desktop?.vitals ?? {};
  return {
    mobilePerformance: l.mobile?.scores.performance ?? null,
    desktopPerformance: l.desktop?.scores.performance ?? null,
    accessibility: main.scores.accessibility,
    seo: main.scores.seo,
    bestPractices: main.scores.bestPractices,
    ...(v.lcpMs !== undefined ? { lcpMs: v.lcpMs } : {}),
    ...(v.cls !== undefined ? { cls: v.cls } : {}),
    ...(v.inpMs !== undefined ? { inpMs: v.inpMs } : {}),
    ...(v.fieldCategory ? { fieldCategory: v.fieldCategory } : {}),
  };
}

export function compactObservePoint(op: ObservePointResult, matrix?: EvidenceMatrix): BatchItemObservePoint {
  const insights = op.insights;
  const privacy = insights?.privacy;
  const footprint = insights?.adobeFootprint;
  return {
    status: op.status,
    ...(op.pagesScanned !== undefined ? { pagesScanned: op.pagesScanned } : {}),
    ...(op.runCompletedAt ? { runCompletedAt: op.runCompletedAt } : {}),
    tagCount: op.tags.length,
    agreementRate: matrix?.stats.agreementRate ?? null,
    confirmed: matrix?.stats.confirmed ?? 0,
    techstackOnly: matrix?.stats.techstackOnly ?? 0,
    observepointOnly: matrix?.stats.observepointOnly ?? 0,
    conflicts: (matrix?.blocks ?? []).filter((b) => b.verdict === 'conflict').map((b) => b.buildingBlock),
    findings: (insights?.findings ?? []).slice(0, MAX_FINDINGS).map((f) => ({
      id: f.id,
      title: f.title,
      type: f.type,
      severity: f.severity,
      ...(f.evidence ? { evidence: f.evidence.slice(0, 200) } : {}),
    })),
    ...(privacy?.consentTool?.name ? { consentTool: privacy.consentTool.name } : {}),
    ...(privacy?.cookies ? { thirdPartyCookies: privacy.cookies.thirdParty } : {}),
    ...(privacy?.requests ? { nonEuRequests: privacy.requests.nonEu } : {}),
    ...(footprint ? { webSdk: footprint.webSdk, appMeasurement: footprint.appMeasurement } : {}),
  };
}

export function compactGeo(g: GeoScoreResult): BatchItemGeo {
  return {
    brand: g.brand,
    geoScore: g.geoScore,
    aiVisibility: g.aiVisibility,
    shareOfVoicePct: g.shareOfVoicePct,
    marketPosition: g.marketPosition,
  };
}

export function compactMobileApps(m: MobileAppsResult): NonNullable<BatchItemEnrichments['mobileApps']> {
  return { count: m.apps.length, apps: m.apps.slice(0, 6).map((a) => ({ store: a.store, name: a.name })) };
}

export function compactUseCases(u: UseCaseDiscoveryResult): NonNullable<BatchItemEnrichments['useCases']> {
  return u.useCases.slice(0, MAX_USE_CASES).map((c) => ({
    title: c.title,
    adobeProducts: c.adobeProducts ?? [],
    ...(c.impact ? { impact: c.impact } : {}),
    ...(c.effort ? { effort: c.effort } : {}),
  }));
}

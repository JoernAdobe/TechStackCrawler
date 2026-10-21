/**
 * Account-/Bulk-Assessment: optionale Enrichments pro Item und aggregierte Account-Sicht.
 * Identische Kopie liegt in client/src/types/batchAccount.ts – synchron halten
 * (einziger Unterschied: Import-Suffix `.js` auf dem Server).
 */
import type { BriefingSectionId, BriefingSummary } from './briefing.js';

/** Client Pre-Briefing (powered by Chris Whitehead): Obergrenze pro Batch, zusätzlich ≤ maxCostlyItems. */
export const MAX_BRIEFING_ITEMS = 20;

/** Quellen, die pro Batch-Item zusätzlich zur Detection laufen können. */
export type BatchEnrichmentSource =
  | 'traffic'
  | 'semrush'
  | 'observepoint'
  | 'mobileApps'
  | 'lighthouse'
  | 'geo'
  | 'useCases'
  | 'multiPage'
  | 'briefing';

export interface BatchEnrichmentOptions {
  /** Tranco-Rang (frei, 1 Anfrage/Sekunde). */
  traffic: boolean;
  /** Semrush-Visits (SEMRUSH_API_KEY nötig, verbraucht API-Units). */
  semrush: boolean;
  /** ObservePoint – nur bestehende Audits lesen (reuse), nie Scans starten. */
  observepoint: boolean;
  /** App-Store-Links/-Suche (iTunes, frei, ~20 Anfragen/Minute). */
  mobileApps: boolean;
  /** PageSpeed Insights / Lighthouse (Google-Quota). */
  lighthouse: boolean;
  /** GEO-Score / AI-Visibility (viele LLM-Calls pro Domain). */
  geo: boolean;
  /** Use Case Discovery (LLM, nur mit voller KI-Analyse). */
  useCases: boolean;
  /** Zusätzliche Unterseiten crawlen (nur Detection-Modus; KI-Modus crawlt immer). */
  multiPage: boolean;
  /** Obergrenze an Items für quotierte/teure Quellen (lighthouse, semrush, geo, useCases). */
  maxCostlyItems: number;
  /**
   * Client Pre-Briefing (async Job, 5–10 Min/Account) für die ersten min(maxCostlyItems, 20)
   * erfolgreichen Items. Im Detection-Modus bekommen diese Items eine volle KI-Analyse als Basis.
   * Fehlt bei alten Batches (gespeicherte Optionen) → wie false behandeln.
   */
  briefing: boolean;
  /** Abschnitte des Briefings (Default: alle; s14 immer enthalten). */
  briefingSections?: BriefingSectionId[];
}

export interface BatchItemTraffic {
  sources: Array<'semrush' | 'tranco'>;
  trancoRank?: number;
  visits?: number;
  uniqueVisitors?: number;
  topCountry?: string;
}

export interface BatchItemLighthouse {
  mobilePerformance: number | null;
  desktopPerformance: number | null;
  accessibility: number | null;
  seo: number | null;
  bestPractices: number | null;
  lcpMs?: number;
  cls?: number;
  inpMs?: number;
  fieldCategory?: string;
}

export interface BatchItemObservePoint {
  status: 'done' | 'running' | 'not_found';
  pagesScanned?: number;
  runCompletedAt?: string;
  tagCount: number;
  agreementRate: number | null;
  confirmed: number;
  techstackOnly: number;
  observepointOnly: number;
  /** Building Blocks, in denen TechStack und ObservePoint disjunkte Lösungen sehen. */
  conflicts: string[];
  findings: Array<{ id: string; title: string; type: string; severity: 'high' | 'medium' | 'low'; evidence?: string }>;
  consentTool?: string;
  thirdPartyCookies?: number;
  nonEuRequests?: number;
  webSdk?: boolean;
  appMeasurement?: boolean;
}

export interface BatchItemGeo {
  brand: string;
  geoScore: number;
  aiVisibility: number;
  shareOfVoicePct: number;
  marketPosition: string;
}

export interface BatchItemEnrichments {
  traffic?: BatchItemTraffic;
  lighthouse?: BatchItemLighthouse;
  observepoint?: BatchItemObservePoint;
  mobileApps?: { count: number; apps: Array<{ store: 'apple' | 'google'; name: string }> };
  geo?: BatchItemGeo;
  useCases?: Array<{ title: string; adobeProducts: string[]; impact?: string; effort?: string }>;
  scanWarnings?: Array<{ code: string; severity: 'info' | 'warning' | 'error'; message: string }>;
  /** Client Pre-Briefing dieses Items (Status/Score werden beim Lesen aktualisiert). */
  briefing?: BriefingSummary;
  /** Quelle → kurze, nutzerlesbare Fehlermeldung. */
  errors?: Partial<Record<BatchEnrichmentSource, string>>;
  /** Quelle → Grund, warum sie bewusst nicht lief (Budget, Quota, Konfiguration). */
  skipped?: Partial<Record<BatchEnrichmentSource, string>>;
}

// ── Account-Sicht (Aggregation über alle fertigen Items) ──────────────────
export interface AccountDomain {
  itemId: number;
  url: string;
  host: string;
  label?: string;
  analysisId?: number;
  /** 0–100, aus Tranco-Rang und/oder Semrush-Visits; null = unbekannt. */
  trafficScore: number | null;
  trancoRank?: number;
  visits?: number;
  techCount: number;
  adobeCount: number;
  mobilePerformance?: number | null;
  geoScore?: number;
  opAgreement?: number | null;
  mobileApps?: number;
}

export interface AccountTechRow {
  technology: string;
  buildingBlock?: string;
  isAdobe: boolean;
  /** Pro Domain (Reihenfolge = AccountView.domains) vorhanden? */
  presence: boolean[];
  count: number;
}

export interface AccountFragmentation {
  buildingBlock: string;
  solutions: Array<{ name: string; isAdobe: boolean; domains: number }>;
}

export interface AccountFootprintRow {
  buildingBlock: string;
  adobe: string[];
  competitors: string[];
  adobeDomains: number;
  competitorDomains: number;
  status: 'adobe' | 'competitor' | 'mixed' | 'none';
}

export interface AccountFinding {
  key: string;
  title: string;
  kind: 'privacy' | 'technical' | 'performance' | 'quality';
  severity: 'high' | 'medium' | 'low';
  source: 'observepoint' | 'consent' | 'scan' | 'lighthouse';
  domains: string[];
  detail?: string;
}

export interface AccountOpportunity {
  buildingBlock: string;
  adobeProduct: string;
  /** Priorität = Σ Traffic-Gewicht × Lücke über die betroffenen Domains (0–100 skaliert). */
  score: number;
  gap: 'competitor' | 'fragmented' | 'none-detected';
  competitors: string[];
  domains: string[];
  rationale: string;
}

export interface AccountUseCase {
  title: string;
  adobeProducts: string[];
  domains: string[];
  score: number;
}

export interface AccountView {
  generatedAt: string;
  domains: AccountDomain[];
  techMatrix: AccountTechRow[];
  fragmentation: AccountFragmentation[];
  footprint: AccountFootprintRow[];
  trafficRanking: Array<{ host: string; score: number; trancoRank?: number; visits?: number }>;
  performanceRanking: Array<{
    host: string;
    mobile: number | null;
    desktop: number | null;
    lcpMs?: number;
    cls?: number;
    fieldCategory?: string;
  }>;
  geoRanking: Array<{ host: string; brand: string; geoScore: number; aiVisibility: number; marketPosition: string }>;
  observepoint: Array<{
    host: string;
    status: string;
    agreementRate: number | null;
    confirmed: number;
    techstackOnly: number;
    observepointOnly: number;
    pagesScanned?: number;
    conflicts: string[];
  }>;
  findings: AccountFinding[];
  opportunities: AccountOpportunity[];
  useCases: AccountUseCase[];
  /** Anzahl Domains mit Daten je Quelle (für "leere Quellen ausblenden"). */
  coverage: Partial<Record<BatchEnrichmentSource | 'detections', number>>;
  /** Fehler/Skips je Quelle über alle Items (für Hinweise im Dashboard). */
  sourceIssues: Array<{ source: BatchEnrichmentSource; errors: number; skipped: number; sample?: string }>;
}

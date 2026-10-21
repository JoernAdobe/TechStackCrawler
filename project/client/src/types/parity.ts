/**
 * EAA-Parität: Typen für Enrichments, Batch-/Account-Assessments und Feedback.
 * Identische Kopie liegt in client/src/types/parity.ts – synchron halten.
 */
import type { AccountView, BatchEnrichmentOptions, BatchItemEnrichments } from './batchAccount';
import type { BriefingSummary } from './briefing';

export interface AnalysisEnrichments {
  lighthouse?: LighthouseResult;
  traffic?: TrafficResult;
  mobileApps?: MobileAppsResult;
  geo?: GeoScoreResult;
  observepoint?: ObservePointResult;
  evidenceMatrix?: EvidenceMatrix;
  /** Client Pre-Briefing (powered by Chris Whitehead) – kompakte Zusammenfassung des neuesten Jobs. */
  briefing?: BriefingSummary;
}

// ── ObservePoint (zweite, unabhängige Erkennungsquelle) ───────────────────
export interface ObservePointTag {
  tagId: number;
  name: string;
  category: string;
  /** Seiten des Runs, auf denen der Tag gefeuert hat. */
  pagesPresent: number;
  /** Tag-Accounts (z. B. Report-Suite, GA4-Measurement-ID, Launch-Property). */
  accounts?: string[];
}

export type ObservePointStatus = 'done' | 'running' | 'not_found';

export interface ObservePointResult {
  url: string;
  domain: string;
  fetchedAt: string;
  status: ObservePointStatus;
  /** true = bestehendes Audit aus dem geteilten Account wiederverwendet, false = von uns gestartet. */
  reused: boolean;
  auditId?: number;
  auditName?: string;
  runId?: number;
  runCompletedAt?: string;
  pagesScanned?: number;
  tags: ObservePointTag[];
  note?: string;
  /** true = vom Hintergrund-Worker verwaltet (Auto-Abgleich bzw. automatischer Fresh-Scan). */
  auto?: boolean;
  /** Zusatz-Insights aus demselben Run (Versionen, Adobe-Footprint, Quality, Privacy, Findings). */
  insights?: ObservePointInsights;
}

// ── ObservePoint-Insights (aus dem gewählten Run, jeder Block fehlertolerant) ─
export type OpFindingType = 'technical' | 'privacy' | 'version';
export type OpFindingSeverity = 'high' | 'medium' | 'low';
/** Thema, über das ein Finding mit Use Cases verknüpft wird. */
export type OpFindingTheme = 'web-sdk' | 'tag-governance' | 'performance' | 'privacy' | 'analytics';

export interface OpFinding {
  id: string;
  type: OpFindingType;
  severity: OpFindingSeverity;
  theme: OpFindingTheme;
  title: string;
  /** Gemessene Evidenz aus dem OP-Run (kurz, zitierfähig). */
  evidence: string;
  /** Adobe-Gesprächsaufhänger. */
  adobeAngle: string;
  adobeProducts: string[];
}

export interface OpTagVersion {
  tag: string;
  version: string;
  pages?: number;
}

export interface OpUpgradeOpportunity {
  id: string;
  title: string;
  evidence: string;
  recommendation: string;
  severity: OpFindingSeverity;
  theme: OpFindingTheme;
  adobeProducts: string[];
}

export interface OpLaunchBuild {
  propertyName?: string;
  propertyId?: string;
  environment?: string;
  environmentId?: string;
  buildDate?: string;
  turbineVersion?: string;
  /** Alter des Builds in Tagen relativ zum Run-Ende. */
  buildAgeDays?: number;
}

export interface OpVersionsInsight {
  tags: OpTagVersion[];
  launch?: OpLaunchBuild;
  upgrades: OpUpgradeOpportunity[];
}

export interface OpAdobeFootprint {
  imsOrgIds: string[];
  reportSuites: string[];
  trackingServers: string[];
  targetClientCodes: string[];
  launch?: OpLaunchBuild;
  /** Distinct eVars/props/list vars in den AA-Beacons der Stichprobenseite. */
  evarCount?: number;
  propCount?: number;
  webSdk: boolean;
  appMeasurement: boolean;
  adobeTags: string[];
  /** Seite, deren Beacons ausgewertet wurden. */
  sampledPage?: string;
}

export interface OpWebVitals {
  lcpMs?: number;
  fcpMs?: number;
  ttfbMs?: number;
  cls?: number;
  /** Bewertung nach Google-Schwellen (good / needs-improvement / poor). */
  ratings: Partial<Record<'lcp' | 'fcp' | 'ttfb' | 'cls', 'good' | 'needs-improvement' | 'poor'>>;
}

export interface OpQualityInsight {
  brokenTags: Array<{ name: string; instances: number }>;
  duplicateTags: Array<{ name: string; duplicates: number; pages: number }>;
  slowTags: Array<{ name: string; medianMs?: number; slowInstances: number }>;
  slowestTags: Array<{ name: string; medianMs: number }>;
  consoleErrorCount?: number;
  consoleWarnCount?: number;
  consoleMessages: Array<{ level: string; message: string; count: number; pages: number; tag?: string }>;
  webVitals?: OpWebVitals;
  avgPageLoadMs?: number;
}

export interface OpCookieInfo {
  name: string;
  domain: string;
  party: '1st' | '3rd';
  durationDays?: number;
  initiatorTags: string[];
}

export interface OpPrivacyInsight {
  cookies: {
    total: number;
    firstParty: number;
    thirdParty: number;
    nonSecure?: number;
    sameSiteEmpty?: number;
    /** Laufzeit > 13 Monate. */
    longLived: number;
  };
  topCookies: OpCookieInfo[];
  consentTool?: { name: string; version?: string };
  googleConsentMode?: { detected: boolean; gcs?: string; gcd?: string };
  requests?: {
    total: number;
    nonEu: number;
    countries: Array<{ code: string; name: string; count: number; eu: boolean }>;
    topNonEuHosts: Array<{ host: string; country: string; count: number }>;
  };
  runContext: { consentActions?: boolean; gpcEnabled?: boolean; blockThirdPartyCookies?: boolean };
}

export interface ObservePointInsights {
  generatedAt: string;
  runCompletedAt?: string;
  pages?: number;
  /** true = Run lief mit Consent-Pre-Audit-Actions (Banner wurde vermutlich akzeptiert). */
  consentAccepted?: boolean;
  versions: OpVersionsInsight | null;
  adobeFootprint: OpAdobeFootprint | null;
  quality: OpQualityInsight | null;
  privacy: OpPrivacyInsight | null;
  findings: OpFinding[];
  /** Hinweise zu fehlgeschlagenen/leeren Blöcken. */
  notes: string[];
}

// ── Evidence Matrix (Technologie × Quelle, Konsens) ───────────────────────
export type EvidenceSourceId = 'techstack' | 'observepoint';

/**
 * confirmed: beide Quellen sehen die Technologie.
 * techstack-only / observepoint-only: nur eine Quelle, obwohl beide sie erkennen könnten.
 * not-comparable: nur eine Quelle, die andere kann diese Technologie grundsätzlich nicht erkennen.
 */
export type ConsensusStatus = 'confirmed' | 'techstack-only' | 'observepoint-only' | 'not-comparable';

export interface EvidenceCell {
  name: string;
  confidence?: number;
  weak?: boolean;
  category?: string;
  pagesPresent?: number;
  pagesScanned?: number;
  accounts?: string[];
  evidence?: string[];
}

export interface EvidenceMatrixRow {
  key: string;
  technology: string;
  buildingBlock?: string;
  isAdobe: boolean;
  status: ConsensusStatus;
  /** Kombinierte Konfidenz 0–1 (Noisy-OR über gewichtete Quellen). */
  confidence: number;
  /** Schwache TechStack-Erkennung, die durch ObservePoint bestätigt wurde. */
  upgradedFromWeak?: boolean;
  sources: Partial<Record<EvidenceSourceId, EvidenceCell>>;
}

export interface BuildingBlockAgreement {
  buildingBlock: string;
  techstack: string[];
  observepoint: string[];
  /** agree: gleiche Lösungen; partial: Überschneidung; conflict: disjunkt; single: nur eine Quelle. */
  verdict: 'agree' | 'partial' | 'conflict' | 'single';
}

export interface EvidenceMatrixStats {
  /** Technologien, die beide Quellen erkennen könnten. */
  comparable: number;
  confirmed: number;
  techstackOnly: number;
  observepointOnly: number;
  notComparable: number;
  /** confirmed / comparable in Prozent; null, wenn nichts vergleichbar ist. */
  agreementRate: number | null;
}

export interface EvidenceMatrix {
  generatedAt: string;
  sources: Array<{ id: EvidenceSourceId; label: string; available: boolean; detail?: string }>;
  rows: EvidenceMatrixRow[];
  blocks: BuildingBlockAgreement[];
  stats: EvidenceMatrixStats;
}

// ── Lighthouse (EAA: lighthouse-score Azure Function) ─────────────────────
export interface LighthouseScores {
  /** 0–100, null wenn die Kategorie nicht berechnet werden konnte. */
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
}

export interface CoreWebVitals {
  /** Largest Contentful Paint in ms. */
  lcpMs?: number;
  /** Cumulative Layout Shift (unitless). */
  cls?: number;
  /** Interaction to Next Paint in ms (Field-Daten, falls vorhanden). */
  inpMs?: number;
  /** First Contentful Paint in ms. */
  fcpMs?: number;
  /** Total Blocking Time in ms (Lab). */
  tbtMs?: number;
  /** Field-Daten-Einstufung von CrUX: FAST | AVERAGE | SLOW. */
  fieldCategory?: string;
}

export interface LighthouseStrategyResult {
  scores: LighthouseScores;
  vitals: CoreWebVitals;
  /** Top-Opportunities (Lighthouse audits mit Einsparpotenzial). */
  opportunities: Array<{ id: string; title: string; savingsMs?: number }>;
}

export interface LighthouseResult {
  url: string;
  fetchedAt: string;
  source: 'pagespeed-insights';
  mobile?: LighthouseStrategyResult;
  desktop?: LighthouseStrategyResult;
  error?: string;
}

// ── Traffic (EAA: traffic-insights via Semrush) ───────────────────────────
export interface TrafficCountryShare {
  country: string;
  /** 0–100 */
  sharePct: number;
  visits?: number;
}

export interface TrafficResult {
  domain: string;
  fetchedAt: string;
  /** Welche Quellen geliefert haben. */
  sources: Array<'semrush' | 'tranco'>;
  /** Globaler Tranco-Popularitätsrang (frei verfügbar, ohne Key). */
  trancoRank?: number;
  semrush?: {
    /** trends = Trends API (echte Visits); seo = Fallback Domain Overview (organische Schätzung). */
    source?: 'trends' | 'seo';
    displayDate?: string;
    visits?: number;
    desktopVisits?: number;
    mobileVisits?: number;
    pagesPerVisit?: number;
    bounceRatePct?: number;
    avgVisitDurationSec?: number;
    uniqueVisitors?: number;
    /** Nur SEO-Fallback: Summe über die Top-Länder-Datenbanken (geschätzter organischer Traffic/Monat). */
    organicTraffic?: number;
    organicKeywords?: number;
    paidTraffic?: number;
    topCountries: TrafficCountryShare[];
    topPages: Array<{ page: string; trafficSharePct?: number }>;
  };
  /** Hinweis, z. B. "SEMRUSH_API_KEY not configured". */
  notes?: string[];
}

// ── Mobile Apps (EAA: Mobile SDK assessment) ──────────────────────────────
export interface MobileAppInfo {
  store: 'apple' | 'google';
  appId: string;
  name: string;
  publisher?: string;
  storeUrl: string;
  iconUrl?: string;
  rating?: number;
  ratingCount?: number;
  version?: string;
  lastUpdated?: string;
  genre?: string;
  /** Wie die App gefunden wurde. */
  foundVia: 'website-link' | 'smart-banner-meta' | 'store-search';
}

export interface MobileAppsResult {
  fetchedAt: string;
  apps: MobileAppInfo[];
  notes?: string[];
}

// ── GEO / AI Visibility (EAA: geo-score-api) ──────────────────────────────
export type FunnelStage = 'Awareness' | 'Interest' | 'Consideration' | 'Purchase';

export interface GeoQueryResult {
  query: string;
  stage: FunnelStage;
  brandMentioned: boolean;
  /** 0–1, 0 = ganz vorne in der Antwort. */
  firstPosition?: number;
  competitorsMentioned: string[];
  sentiment?: 'Positive' | 'Neutral' | 'Negative';
  excerpt?: string;
}

export interface GeoCompetitorScore {
  name: string;
  domain?: string;
  mentions: number;
  visibilityPct: number;
}

export interface GeoScoreResult {
  brand: string;
  domain: string;
  country: string;
  industry: string;
  fetchedAt: string;
  model: string;
  /** 0–100 */
  geoScore: number;
  /** 0–100 */
  aiVisibility: number;
  components: {
    mentionFrequency: number;
    prominence: number;
    queryCoverage: number;
    sentiment: number;
    competitorGap: number;
  };
  shareOfVoicePct: number;
  marketPosition: 'Market Leader' | 'Strong Position' | 'Competitive' | 'Challenged';
  funnel: Array<{ stage: FunnelStage; queries: number; mentions: number; visibilityPct: number }>;
  competitors: GeoCompetitorScore[];
  queries: GeoQueryResult[];
  recommendations: string[];
  methodologyNote: string;
}

// ── EAA Building Blocks / Solution Mapping ────────────────────────────────
/** Konsistenz-Code aus EAA "Insights Logic": 1 eine Lösung, 2 mehrere, -1 eine Lösung inkonsistent, -2 verschiedene Lösungen auf verschiedenen Properties, 0 keine. */
export type ConsistencyCode = 1 | 2 | -1 | -2 | 0;

export interface SolutionMappingCell {
  /** Erkannte Lösungen in diesem Building Block für diese URL. */
  solutions: Array<{ name: string; isAdobe: boolean; weak?: boolean }>;
}

export interface KeyFinding {
  buildingBlock: string;
  code: ConsistencyCode;
  solutions: string[];
  findings: string[];
}

export interface SolutionMappingMatrix {
  /** Spaltenköpfe (eine Spalte pro URL/Property). */
  columns: Array<{ url: string; label?: string; analysisId?: number }>;
  /** Zeilen in EAA-Reihenfolge. */
  rows: Array<{ buildingBlock: string; cells: SolutionMappingCell[] }>;
  keyFindings: KeyFinding[];
  /** Technologien ohne Building-Block-Zuordnung (EAA: "Unknown Solutions"). */
  otherTechnologies: string[];
}

// ── Batch / Account / Bulk Assessments ────────────────────────────────────
export type AssessmentLens = 'Brand' | 'Geo' | 'Journey Stage' | 'Competitors' | 'Other';
export type BatchKind = 'account' | 'bulk';
export type BatchStatus = 'pending_approval' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'rejected';
export type BatchItemStatus = 'queued' | 'running' | 'done' | 'failed' | 'skipped';

export interface BatchItem {
  id: number;
  url: string;
  /** Freitext-Label je Lens, z. B. Marke, Land, Journey-Stage oder Wettbewerber. */
  label?: string;
  status: BatchItemStatus;
  analysisId?: number;
  error?: string;
  /** Kompakte Detektionen für Matrix/CSV (auch ohne KI-Analyse). */
  detections?: Array<{ name: string; categories: string[]; confidence: number; weak?: boolean; preConsent?: boolean }>;
  /** Kompakte Enrichment-Ergebnisse (Traffic, Lighthouse, ObservePoint …), siehe batchAccount.ts. */
  enrichments?: BatchItemEnrichments;
  startedAt?: string;
  finishedAt?: string;
}

export interface BatchJob {
  id: number;
  kind: BatchKind;
  title: string;
  lens?: AssessmentLens;
  accountName?: string;
  industry?: string;
  opportunityId?: string;
  /** true = volle Claude-Analyse pro URL; false = nur Detection (schnell, ohne LLM-Kosten). */
  aiAnalysis: boolean;
  status: BatchStatus;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  total: number;
  done: number;
  failed: number;
  items?: BatchItem[];
  matrix?: SolutionMappingMatrix;
  enrichmentOptions?: BatchEnrichmentOptions;
  accountView?: AccountView;
}

// ── Feedback (EAA: feedback form → Jira) ──────────────────────────────────
export type FeedbackType =
  | 'Bug: Missing Solution'
  | 'Bug: Wrong Detection'
  | 'Bug'
  | 'Enhancement/Feature'
  | 'Praise'
  | 'Other';

export interface FeedbackEntry {
  id?: number;
  analysisId?: number;
  batchId?: number;
  type: FeedbackType;
  /** 1 = 👍, -1 = 👎, 0 = neutral */
  rating?: -1 | 0 | 1;
  title?: string;
  description: string;
  missingSolutions?: Array<{ url?: string; solution: string; category?: string }>;
  createdBy?: string;
  createdAt?: string;
  status?: 'open' | 'triaged' | 'done';
}

// ── Stack History (EAA: Multi-Year View) ──────────────────────────────────
export interface StackHistoryEntry {
  analysisId: number;
  analyzedAt: string;
  technologies: string[];
}

export interface StackHistoryResult {
  hostname: string;
  entries: StackHistoryEntry[];
  /** Diff aktuell vs. vorherige Analyse. */
  delta?: { previousAnalysisId: number; added: string[]; removed: string[]; unchanged: string[] };
}

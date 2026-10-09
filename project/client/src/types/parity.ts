/**
 * EAA-Parität: Typen für Enrichments, Batch-/Account-Assessments und Feedback.
 * Identische Kopie liegt in client/src/types/parity.ts – synchron halten.
 */

export interface AnalysisEnrichments {
  lighthouse?: LighthouseResult;
  traffic?: TrafficResult;
  mobileApps?: MobileAppsResult;
  geo?: GeoScoreResult;
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
    displayDate?: string;
    visits?: number;
    desktopVisits?: number;
    mobileVisits?: number;
    pagesPerVisit?: number;
    bounceRatePct?: number;
    avgVisitDurationSec?: number;
    uniqueVisitors?: number;
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
  detections?: Array<{ name: string; categories: string[]; confidence: number; weak?: boolean }>;
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

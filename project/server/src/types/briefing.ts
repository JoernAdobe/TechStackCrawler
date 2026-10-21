/**
 * Client Pre-Briefing – powered by Chris Whitehead (Repo „Client-Report“).
 * Gemeinsamer Vertrag zwischen Pipeline, Job-Queue, API, UI, Batch und MCP.
 * Spiegel: client/src/types/briefing.ts – beide Dateien identisch halten.
 */

export const BRIEFING_CREDIT = 'Client Pre-Briefing powered by Chris Whitehead';

export const BRIEFING_SECTION_IDS = [
  's01', 's02', 's03', 's04', 's05', 's06', 's07',
  's08', 's09', 's10', 's11', 's12', 's13', 's14',
] as const;
export type BriefingSectionId = (typeof BRIEFING_SECTION_IDS)[number];

/** s14 ist immer aktiv (im UI gesperrt). */
export const BRIEFING_LOCKED_SECTION: BriefingSectionId = 's14';

export interface BriefingSectionMeta {
  id: BriefingSectionId;
  /** Titel wie im Mock / h2 ohne Punkt. */
  title: string;
  /** Eyebrow-Label aus standard-sections.md. */
  eyebrow: string;
  /** lucide-react Icon-Name für das UI. */
  icon: string;
}

export const BRIEFING_SECTIONS: readonly BriefingSectionMeta[] = [
  { id: 's01', title: 'Company Overview', eyebrow: 'Client Background', icon: 'Building2' },
  { id: 's02', title: 'Products & Services', eyebrow: 'Portfolio', icon: 'Package' },
  { id: 's03', title: 'Financial Performance', eyebrow: 'Financial Snapshot', icon: 'BarChart3' },
  { id: 's04', title: 'Digital Transformation & Technology', eyebrow: 'Digital & Technology', icon: 'Cpu' },
  { id: 's05', title: 'Marketing & Advertising Strategy', eyebrow: 'Marketing & Communications', icon: 'Megaphone' },
  { id: 's06', title: 'Social Media & Content Strategy', eyebrow: 'Social & Content', icon: 'Users' },
  { id: 's07', title: 'SEO & Search Visibility', eyebrow: 'Search & Discovery', icon: 'Search' },
  { id: 's08', title: 'Brand & Website Portfolio', eyebrow: 'Brand & Web Presence', icon: 'Globe' },
  { id: 's09', title: 'Competitive Landscape', eyebrow: 'Competitive Intelligence', icon: 'Trophy' },
  { id: 's10', title: 'Customer & Market Profile', eyebrow: 'Audience & Markets', icon: 'Target' },
  { id: 's11', title: 'Regulatory & Compliance', eyebrow: 'Regulatory Environment', icon: 'FileText' },
  { id: 's12', title: 'Stakeholder Mapping', eyebrow: 'Key Stakeholders', icon: 'Network' },
  { id: 's13', title: 'Strategic Direction', eyebrow: 'Strategic Direction', icon: 'Compass' },
  { id: 's14', title: 'Adobe Opportunity', eyebrow: 'Adobe Alignment', icon: 'Lightbulb' },
];

// ── Inhalt ──────────────────────────────────────────────────────────────────

export interface BriefingSource {
  title: string;
  url: string;
  publisher?: string;
  /** Format "Mon YYYY" (z. B. "Sep 2026"); "n.d." wenn unbekannt. */
  date: string;
  /** false = Quelle gehört dem Kunden (eigene Domain). */
  independent: boolean;
  /** true = nur Snippet gesehen (Paywall), Volltext nicht abgerufen. */
  snippetOnly?: boolean;
}

/** Strukturierte Bausteine – Komponenten aus design/components.md. Text = Plaintext, kein HTML. */
export type BriefingBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'feature-grid'; cards: Array<{ label: string; value: string; detail?: string }> }
  | { type: 'steps'; items: Array<{ title: string; body: string }> }
  | { type: 'note'; title?: string; text: string }
  | { type: 'legend'; items: Array<{ label: string; color: string; text: string }> }
  | { type: 'table'; headers: string[]; rows: string[][] };

export type BriefingSectionStatus = 'done' | 'thin' | 'skipped' | 'error';

export interface BriefingSection {
  id: BriefingSectionId;
  title: string;
  eyebrow: string;
  status: BriefingSectionStatus;
  blocks: BriefingBlock[];
  sources: BriefingSource[];
  /** Lücken: "not publicly available"/"not verified" inkl. versuchter Wege. */
  gaps: string[];
}

// ── Executive / Score ─────────────────────────────────────────────────────

export type SubScoreKey = 'whitespace' | 'maturity' | 'reach' | 'momentum' | 'urgency';

export const SUB_SCORE_WEIGHTS: Record<SubScoreKey, number> = {
  whitespace: 0.3,
  maturity: 0.15,
  reach: 0.15,
  momentum: 0.2,
  urgency: 0.2,
};

export interface SubScore {
  key: SubScoreKey;
  label: string;
  weight: number;
  /** 0–100; null = not assessed (wird aus dem Gesamtwert herausgerechnet). */
  value: number | null;
  kind: 'measured' | 'rated';
  /** Bei kind=rated: Rubrik-Stufe 1–5. */
  rubricLevel?: number;
  rationale: string;
  sectionRefs: BriefingSectionId[];
  sources?: BriefingSource[];
}

export type ScoreBand = 'high' | 'medium' | 'low';
export type Confidence = 'high' | 'medium' | 'low';

export type ExecutiveBulletKey = 'whyNow' | 'topOpportunity' | 'keyRisk' | 'whoToTalkTo' | 'nextStep';

export interface ExecutiveBullet {
  key: ExecutiveBulletKey;
  label: string;
  text: string;
  sectionRef?: BriefingSectionId;
  source?: BriefingSource;
}

export interface AdobePlay {
  product: string;
  headline: string;
  /** Der Fakt aus dem Briefing, auf den sich der Play stützt. */
  basedOn: string;
  sectionRef: BriefingSectionId;
}

export interface ExecutiveSummary {
  /** „Overall Pre-Briefing Score“ 0–100, serverseitig aus subScores berechnet. */
  overallScore: number | null;
  band: ScoreBand;
  confidence: Confidence;
  /** Ein Satz Fazit. */
  verdict: string;
  bullets: ExecutiveBullet[];
  subScores: SubScore[];
  topPlays: AdobePlay[];
}

// ── Job / Ergebnis ────────────────────────────────────────────────────────

export type BriefingJobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export type BriefingSectionProgressState =
  | 'pending' | 'researching' | 'writing' | 'done' | 'thin' | 'skipped' | 'error';

export interface BriefingProgress {
  /** 'executive' = Score/Zusammenfassung, 'render' = HTML + Validierung. */
  step: BriefingSectionId | 'executive' | 'render';
  state: BriefingSectionProgressState;
  message?: string;
}

export interface BriefingJob {
  id: number;
  analysisId: number;
  status: BriefingJobStatus;
  sections: BriefingSectionId[];
  progress: BriefingProgress[];
  companyName?: string;
  createdBy?: string;
  batchId?: number;
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface BriefingValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface BriefingUsage {
  inputTokens: number;
  outputTokens: number;
  /** Geschätzte Bedrock-Kosten in USD. */
  usd: number;
  searches: number;
  fetches: number;
}

export interface BriefingResult {
  jobId: number;
  analysisId: number;
  companyName: string;
  domain: string;
  /** Domains des Kunden (für source independence). */
  clientDomains: string[];
  generatedAt: string;
  language: 'en';
  sections: BriefingSection[];
  executive: ExecutiveSummary;
  validation: BriefingValidation;
  usage: BriefingUsage;
}

/** Kompakte Zusammenfassung in analysis.enrichments.briefing bzw. batch item enrichments. */
export interface BriefingSummary {
  jobId: number;
  status: BriefingJobStatus;
  overallScore: number | null;
  band?: ScoreBand;
  confidence?: Confidence;
  verdict?: string;
  generatedAt?: string;
}

// ── API ───────────────────────────────────────────────────────────────────
// POST /api/analyses/:id/briefing         body StartBriefingRequest → 202 BriefingJob (läuft schon einer: 200 mit diesem)
// GET  /api/analyses/:id/briefing         → BriefingStateResponse (neuester Job der Analyse)
// GET  /api/briefings/:jobId              → BriefingStateResponse
// POST /api/briefings/:jobId/cancel       → BriefingJob
// GET  /api/briefings/:jobId/report.html  → text/html (self-contained); ?download=1 → attachment

export interface StartBriefingRequest {
  sections: BriefingSectionId[];
}

export interface BriefingStateResponse {
  job: BriefingJob | null;
  result: BriefingResult | null;
}

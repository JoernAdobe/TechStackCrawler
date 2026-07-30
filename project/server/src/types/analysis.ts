/**
 * Canonical source: project/shared/types.ts
 * Keep in sync – or migrate to TypeScript project references.
 */

export interface DetectedTechnology {
  name: string;
  categories: string[];
  confidence: number;
  version?: string;
  website?: string;
  /** Erkennung beruht nur auf einem einzigen generischen HTML-Signal (unverifiziert). */
  weak?: boolean;
}

export interface CategoryResult {
  category: string;
  currentTechnology: string;
  challengesAndPainPoints: string;
  adobeOpportunity: string;
}

export interface AnalysisResult {
  id?: number;
  /** Vom User eingegebene URL (primär). */
  url: string;
  /** Tatsächlich geladene URL nach Redirects, nur falls abweichend. */
  finalUrl?: string;
  /** @deprecated frühere Semantik (Redirect-Quelle); durch `finalUrl` ersetzt. */
  requestedUrl?: string;
  analyzedAt: string;
  summary: string;
  categories: CategoryResult[];
  rawDetections: DetectedTechnology[];
  pageContentExcerpt?: string;
  useCaseDiscovery?: UseCaseDiscoveryResult;
  sitemapUrls?: string[];
}

export interface UseCaseItem {
  rank: number;
  title: string;
  description: string;
  adobeProducts: string[];
  businessValue: string;
  implementationHint?: string;
  /** Quantifizierte Wirkung inkl. Zahl/Range (z. B. "+10–20% conversion"). TechCase-Sektion 06. */
  quantifiedRoi?: string;
  /** Branchen-Benchmark, der die Zahl stützt (z. B. "Retailers see 15–30% uplift from personalization"). */
  industryBenchmark?: string;
  /** Umsetzungsaufwand. */
  effort?: 'Low' | 'Medium' | 'High';
  /** Zeit bis zum ersten messbaren Wert (z. B. "4–8 weeks"). */
  timeToValue?: string;
  /** Geschäftlicher Impact. */
  impact?: 'Low' | 'Medium' | 'High';
}

export interface UseCaseDiscoveryResult {
  useCases: UseCaseItem[];
  summary: string;
}

export interface ProgressEvent {
  phase: 'scraping' | 'detecting' | 'analyzing' | 'complete' | 'error';
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

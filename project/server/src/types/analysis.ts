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

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
}

export interface CategoryResult {
  category: string;
  currentTechnology: string;
  challengesAndPainPoints: string;
  adobeOpportunity: string;
}

export interface AnalysisResult {
  id?: number;
  url: string;
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

export type AppState = 'idle' | 'analyzing' | 'results' | 'error';

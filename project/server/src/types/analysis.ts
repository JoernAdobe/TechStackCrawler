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
  url: string;
  analyzedAt: string;
  summary: string;
  categories: CategoryResult[];
  rawDetections: DetectedTechnology[];
  /** Truncated page content for Use Case Discovery (max ~12k chars) */
  pageContentExcerpt?: string;
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

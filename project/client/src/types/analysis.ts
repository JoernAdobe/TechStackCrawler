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
}

export interface ProgressEvent {
  phase: 'scraping' | 'detecting' | 'analyzing' | 'complete' | 'error';
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export type AppState = 'idle' | 'analyzing' | 'results' | 'error';

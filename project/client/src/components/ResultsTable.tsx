import type { AnalysisResult } from '../types/analysis';
import ResultCard from './ResultCard';

interface ResultsTableProps {
  results: AnalysisResult;
}

export default function ResultsTable({ results }: ResultsTableProps) {
  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      {/* Summary */}
      <div className="mb-8 bg-ts-surface-card rounded-xl border border-ts-border p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">📋</span>
          <h2 className="text-lg font-semibold text-ts-text-primary">
            Executive Summary
          </h2>
        </div>
        <p className="text-ts-text-secondary leading-relaxed">
          {results.summary}
        </p>
        <div className="mt-4 flex items-center gap-4 text-xs text-ts-text-secondary">
          <span>
            URL:{' '}
            <a
              href={results.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ts-accent-light hover:underline"
            >
              {results.url}
            </a>
          </span>
          <span>
            Analyzed:{' '}
            {new Date(results.analyzedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </div>

      {/* Category Grid */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ts-text-primary">
          Technology Stack Analysis
        </h2>
        <div className="flex items-center gap-3 text-xs text-ts-text-secondary">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-ts-success" />
            Detected
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-ts-warning" />
            Not Found
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {results.categories.map((cat, i) => (
          <ResultCard key={cat.category} result={cat} index={i} />
        ))}
      </div>

      {/* Raw Detections */}
      {results.rawDetections.length > 0 && (
        <div className="mt-8 bg-ts-surface-card rounded-xl border border-ts-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">🔍</span>
            <h2 className="text-lg font-semibold text-ts-text-primary">
              All Detected Technologies ({results.rawDetections.length})
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {results.rawDetections.map((tech) => (
              <span
                key={tech.name}
                className="inline-flex items-center gap-1.5 text-xs bg-ts-surface-light border border-ts-border px-3 py-1.5 rounded-full text-ts-text-secondary hover:text-ts-text-primary hover:border-ts-accent/30 transition-colors"
              >
                <span className="font-medium text-ts-text-primary">
                  {tech.name}
                </span>
                {tech.version && (
                  <span className="text-ts-accent-light">v{tech.version}</span>
                )}
                <span className="opacity-50">
                  {tech.confidence}%
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

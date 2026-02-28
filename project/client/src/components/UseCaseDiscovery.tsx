import { useState, useEffect } from 'react';
import type { AnalysisResult, UseCaseItem } from '../types/analysis';
import SpotlightCard from './SpotlightCard';

const PROGRESS_STEPS = [
  'Fetching sitemap…',
  'Analyzing page structure…',
  'Identifying interesting URLs…',
  'AI is generating use cases…',
  'Almost done…',
];

interface UseCaseDiscoveryProps {
  analysis: AnalysisResult;
  onDiscover: () => void;
  loading: boolean;
  result: { useCases: UseCaseItem[]; summary: string } | null;
  error: string | null;
}

export default function UseCaseDiscovery({
  analysis,
  onDiscover,
  loading,
  result,
  error,
}: UseCaseDiscoveryProps) {
  const displayResult = result ?? analysis.useCaseDiscovery;
  const [progressStep, setProgressStep] = useState(0);

  useEffect(() => {
    if (!loading) {
      setProgressStep(0);
      return;
    }
    const interval = setInterval(() => {
      setProgressStep((prev) => (prev + 1) % PROGRESS_STEPS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [loading]);

  return (
    <section className="px-6 py-8 max-w-7xl mx-auto">
      <div className="mb-8 bg-ts-surface-card rounded-2xl border border-ts-border overflow-hidden">
        {/* Header with gradient */}
        <div className="relative bg-gradient-to-br from-ts-accent/20 via-ts-surface-card to-adobe-red/10 p-6 border-b border-ts-border">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.15)_0%,transparent_50%)]" />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-ts-text-primary flex items-center gap-2">
                <span className="text-2xl">💡</span>
                Use Case Discovery
              </h2>
              <p className="mt-1 text-sm text-ts-text-secondary max-w-xl">
                AI-powered recommendations: Top 10 use cases based on your tech
                stack and site context – with Adobe solutions for each.
              </p>
            </div>
            {!displayResult && !loading && (
              <button
                onClick={onDiscover}
                disabled={loading}
                className="shrink-0 px-5 py-2.5 bg-gradient-to-r from-ts-accent to-ts-accent-light text-white font-medium rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-ts-accent/20"
              >
                Discover Use Cases
              </button>
            )}
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="p-8 flex flex-col items-center justify-center gap-6">
            <div className="w-10 h-10 border-2 border-ts-accent border-t-transparent rounded-full animate-spin" />
            <div className="text-center space-y-2">
              <p className="text-ts-text-primary font-medium">
                {PROGRESS_STEPS[progressStep]}
              </p>
              <p className="text-xs text-ts-text-secondary">
                Step {progressStep + 1} of {PROGRESS_STEPS.length} – this may take
                a minute
              </p>
            </div>
            <div className="flex gap-1.5">
              {PROGRESS_STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    i === progressStep ? 'bg-ts-accent' : 'bg-ts-border'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="p-6 flex flex-col items-center gap-3">
            <span className="text-4xl">⚠️</span>
            <p className="text-ts-text-secondary text-center">{error}</p>
            <button
              onClick={onDiscover}
              className="px-4 py-2 bg-ts-surface-light border border-ts-border rounded-lg text-ts-text-primary hover:border-ts-accent/50 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Results */}
        {displayResult && !loading && (
          <div className="p-6 space-y-6">
            {displayResult.summary && (
              <p className="text-ts-text-secondary leading-relaxed">
                {displayResult.summary}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
              {displayResult.useCases.map((uc) => (
                <UseCaseCard key={uc.rank} useCase={uc} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state - show CTA when no result yet */}
        {!displayResult && !loading && !error && (
          <div className="p-8 text-center">
            <p className="text-ts-text-secondary text-sm">
              Click &quot;Discover Use Cases&quot; to generate AI-powered
              recommendations.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function UseCaseCard({ useCase }: { useCase: UseCaseItem }) {
  return (
    <SpotlightCard
      className="bg-ts-surface-light/50 rounded-xl border border-ts-border hover:border-ts-accent/30 transition-all duration-300"
      spotlightColor="rgba(99, 102, 241, 0.12)"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ts-accent/20 text-ts-accent font-bold text-sm">
            {useCase.rank}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-ts-text-primary">
              {useCase.title}
            </h3>
            <p className="mt-1.5 text-sm text-ts-text-secondary leading-relaxed">
              {useCase.description}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {useCase.adobeProducts.map((product) => (
                <span
                  key={product}
                  className="inline-flex items-center px-2 py-0.5 rounded-md bg-adobe-red/15 text-adobe-red text-xs font-medium"
                >
                  {product}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-ts-text-secondary">
              <span className="font-medium text-ts-text-primary">
                Business value:
              </span>{' '}
              {useCase.businessValue}
            </p>
            {useCase.implementationHint && (
              <p className="mt-1.5 text-xs text-ts-accent-light/90 italic">
                💡 {useCase.implementationHint}
              </p>
            )}
          </div>
        </div>
      </div>
    </SpotlightCard>
  );
}

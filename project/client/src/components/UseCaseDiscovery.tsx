import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Lightbulb } from 'lucide-react';
import type { AnalysisResult, UseCaseItem } from '../types/analysis';
import SpotlightCard from './SpotlightCard';
import { Badge } from './ui/badge';
import LetterGlitch from './LetterGlitch';

gsap.registerPlugin(useGSAP);

const PROGRESS_STEPS = [
  'Sitemap wird geladen...',
  'Seitenstruktur wird analysiert...',
  'Relevante URLs werden ausgewertet...',
  'Use Cases werden generiert...',
  'Abschluss...',
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
  const gridRef = useRef<HTMLDivElement>(null);

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

  useGSAP(
    () => {
      if (!gridRef.current || !displayResult || loading) return;
      const cards = gridRef.current.querySelectorAll(':scope > *');
      gsap.fromTo(
        cards,
        { opacity: 0, y: 30, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.1, ease: 'power3.out' },
      );
    },
    { dependencies: [displayResult, loading], scope: gridRef },
  );

  return (
    <section className="px-6 py-8 max-w-7xl mx-auto">
      <div className="mb-8 bg-ts-surface-card rounded-2xl border border-ts-border overflow-hidden">
        {/* Header with gradient */}
        <div className="relative bg-gradient-to-br from-ts-accent/20 via-ts-surface-card to-adobe-red/10 p-6 border-b border-ts-border">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.15)_0%,transparent_50%)]" />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-ts-text-primary flex items-center gap-2">
                <Lightbulb className="w-6 h-6 text-ts-warning" strokeWidth={1.5} />
                Use Case Discovery
              </h2>
              <p className="mt-1 text-sm text-ts-text-secondary max-w-xl">
                AI-powered recommendations: Top 10 use cases based on your tech
                stack and site context -- with Adobe solutions for each.
              </p>
            </div>
            {!displayResult && !loading && (
              <button
                onClick={onDiscover}
                disabled={loading}
                className="shrink-0 px-5 py-2.5 bg-gradient-to-r from-ts-accent to-ts-accent-light text-white font-medium rounded-xl hover:opacity-90 transition-all duration-200 shadow-lg shadow-ts-accent/20 hover:shadow-ts-accent/40 hover:scale-[1.02] active:scale-[0.98]"
              >
                Discover Use Cases
              </button>
            )}
          </div>
        </div>

        {/* Loading state with glitch */}
        {loading && (
          <div className="relative p-8 flex flex-col items-center justify-center gap-6 overflow-hidden">
            <div className="absolute inset-0 opacity-[0.04]">
              <LetterGlitch
                glitchColors={['#1a1a2e', '#6366f1', '#EB1000']}
                glitchSpeed={80}
                centerVignette={true}
                outerVignette={true}
                smooth={true}
                characters="USE CASE DISCOVERY AI ANALYSIS ADOBE"
              />
            </div>
            <div className="relative w-12 h-12 border-2 border-ts-accent border-t-transparent rounded-full animate-spin" />
            <div className="relative text-center space-y-2">
              <p className="text-ts-text-primary font-medium">
                {PROGRESS_STEPS[progressStep]}
              </p>
              <p className="text-xs text-ts-text-secondary">
                Pruefe Seite {progressStep + 1} von {PROGRESS_STEPS.length} --
                mehrere Seiten werden beruecksichtigt, kann eine Minute dauern
              </p>
            </div>
            <div className="relative flex gap-2">
              {PROGRESS_STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-2 rounded-full transition-all duration-500 ${
                    i === progressStep ? 'bg-ts-accent w-6' : i < progressStep ? 'bg-ts-accent/40 w-2' : 'bg-ts-border w-2'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="p-6 flex flex-col items-center gap-3">
            <span className="text-4xl">&#x26A0;&#xFE0F;</span>
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
            <div ref={gridRef} className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
              {displayResult.useCases.map((uc) => (
                <UseCaseCard key={uc.rank} useCase={uc} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
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

const rankStyles: Record<number, string> = {
  1: 'bg-gradient-to-br from-amber-400 to-amber-600 text-black shadow-[0_0_12px_rgba(245,158,11,0.3)]',
  2: 'bg-gradient-to-br from-gray-300 to-gray-400 text-black shadow-[0_0_12px_rgba(156,163,175,0.3)]',
  3: 'bg-gradient-to-br from-amber-700 to-amber-800 text-amber-100 shadow-[0_0_12px_rgba(180,83,9,0.3)]',
};

function UseCaseCard({ useCase }: { useCase: UseCaseItem }) {
  const defaultRankStyle = 'bg-ts-accent/20 text-ts-accent';

  return (
    <SpotlightCard
      className="bg-ts-surface-light/50 rounded-xl border border-ts-border hover:border-ts-accent/30 transition-all duration-300"
      spotlightColor="rgba(99, 102, 241, 0.12)"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-bold text-sm ${
            rankStyles[useCase.rank] || defaultRankStyle
          }`}>
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
                <Badge
                  key={product}
                  variant="secondary"
                  className="bg-adobe-red/10 text-adobe-red border border-adobe-red/20 hover:bg-adobe-red/20 hover:shadow-glow-red transition-all duration-200 text-xs"
                >
                  {product}
                </Badge>
              ))}
            </div>
            <p className="mt-2.5 text-xs text-ts-text-secondary">
              <span className="font-medium text-ts-text-primary">
                Business value:
              </span>{' '}
              {useCase.businessValue}
            </p>
            {useCase.implementationHint && (
              <p className="mt-1.5 text-xs text-ts-accent-light/90 italic flex items-center gap-1">
                <Lightbulb className="w-3 h-3 shrink-0" />
                {useCase.implementationHint}
              </p>
            )}
          </div>
        </div>
      </div>
    </SpotlightCard>
  );
}

import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Lightbulb, CheckCircle2, Sparkles } from 'lucide-react';
import type { AnalysisResult, UseCaseItem } from '../types/analysis';

gsap.registerPlugin(useGSAP);

const PROGRESS_STEPS = [
  { label: 'Sitemap', description: 'Loading sitemap and page structure...' },
  { label: 'Pages', description: 'Analyzing relevant page content...' },
  { label: 'Context', description: 'Evaluating site context and tech stack...' },
  { label: 'AI Analysis', description: 'Generating personalized use cases...' },
  { label: 'Finishing', description: 'Preparing recommendations...' },
];

interface UseCaseDiscoveryProps {
  analysis: AnalysisResult;
  onDiscover: () => void;
  loading: boolean;
  result: { useCases: UseCaseItem[]; summary: string } | null;
  error: string | null;
}

function useElapsedTime(isActive: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isActive) { setElapsed(0); return; }
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [isActive]);
  return elapsed;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
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
  const elapsed = useElapsedTime(loading);

  useEffect(() => {
    if (!loading) {
      setProgressStep(0);
      return;
    }
    const interval = setInterval(() => {
      setProgressStep((prev) =>
        prev < PROGRESS_STEPS.length - 1 ? prev + 1 : prev,
      );
    }, 4000);
    return () => clearInterval(interval);
  }, [loading]);

  useGSAP(
    () => {
      if (!gridRef.current || !displayResult || loading) return;
      const cards = gridRef.current.querySelectorAll(':scope > *');
      gsap.fromTo(
        cards,
        { opacity: 0, y: 30, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.08, ease: 'power3.out' },
      );
    },
    { dependencies: [displayResult, loading], scope: gridRef },
  );

  return (
    <section className="px-6 py-8 max-w-7xl mx-auto">
      <div className="mb-8 bg-ts-surface-card rounded-2xl border border-ts-border overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-ts-accent/10 via-ts-surface-card to-adobe-red/5 p-6 border-b border-ts-border">
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-ts-text-primary flex items-center gap-2">
                <Lightbulb className="w-6 h-6 text-ts-warning" strokeWidth={1.5} />
                Use Case Discovery
              </h2>
              <p className="mt-1 text-sm text-ts-text-secondary max-w-xl">
                AI-powered recommendations: Top 10 use cases based on your tech
                stack and site context — with Adobe solutions for each.
              </p>
            </div>
            {!displayResult && !loading && (
              <button
                onClick={onDiscover}
                disabled={loading}
                className="shrink-0 px-5 py-2.5 bg-gradient-to-r from-adobe-red to-adobe-red-dark text-white font-medium rounded-xl hover:opacity-90 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                Discover Use Cases
              </button>
            )}
          </div>
        </div>

        {/* Loading state — stepper progress */}
        {loading && (
          <div className="p-6 space-y-6">
            {/* Stepper */}
            <div className="flex items-center justify-between gap-1">
              {PROGRESS_STEPS.map((step, i) => (
                <div key={i} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-500 ${
                      i < progressStep
                        ? 'bg-ts-success/20 text-ts-success'
                        : i === progressStep
                          ? 'bg-adobe-red/20 text-adobe-red ring-2 ring-adobe-red/30'
                          : 'bg-ts-surface-light text-ts-text-secondary border border-ts-border'
                    }`}>
                      {i < progressStep ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span className={`text-[10px] font-medium hidden sm:block ${
                      i <= progressStep ? 'text-ts-text-primary' : 'text-ts-text-secondary/50'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                  {i < PROGRESS_STEPS.length - 1 && (
                    <div className={`flex-1 h-px mx-2 mt-[-18px] sm:mt-[-18px] transition-colors duration-500 ${
                      i < progressStep ? 'bg-ts-success/40' : 'bg-ts-border'
                    }`} />
                  )}
                </div>
              ))}
            </div>

            {/* Progress bar with shimmer */}
            <div>
              <div className="h-1.5 bg-ts-surface rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${Math.min(95, ((progressStep + 0.5) / PROGRESS_STEPS.length) * 100)}%`,
                    background: 'linear-gradient(90deg, #E8503A, #C73D2A, #E8503A)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 2s linear infinite',
                  }}
                />
              </div>
              <div className="mt-3 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-adobe-red animate-pulse" />
                  <p className="text-sm text-ts-text-primary font-medium">
                    {PROGRESS_STEPS[progressStep].description}
                  </p>
                </div>
                <span className="text-xs text-ts-text-secondary tabular-nums">
                  {formatTime(elapsed)}
                </span>
              </div>
            </div>

            <p className="text-xs text-ts-text-secondary text-center">
              Multiple pages are analyzed — this may take a minute
            </p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="p-6 flex flex-col items-center gap-3">
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
              <p className="text-ts-text-secondary leading-relaxed text-sm">
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

/* ── Rank accent colors ── */
const rankAccents: Record<number, { border: string; bg: string; text: string }> = {
  1: { border: 'border-l-amber-400', bg: 'bg-amber-400/10', text: 'text-amber-400' },
  2: { border: 'border-l-gray-400', bg: 'bg-gray-400/10', text: 'text-gray-400' },
  3: { border: 'border-l-amber-700', bg: 'bg-amber-700/10', text: 'text-amber-700' },
};
const defaultAccent = { border: 'border-l-ts-accent', bg: 'bg-ts-accent/10', text: 'text-ts-accent' };

function UseCaseCard({ useCase }: { useCase: UseCaseItem }) {
  const accent = rankAccents[useCase.rank] || defaultAccent;

  return (
    <div className={`rounded-xl border border-ts-border bg-ts-surface-card overflow-hidden border-l-[3px] ${accent.border} hover:border-ts-accent/30 transition-all duration-300`}>
      {/* Header: Rank + Title */}
      <div className="p-5 pb-0">
        <div className="flex items-start gap-3">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-sm ${accent.bg} ${accent.text}`}>
            {useCase.rank}
          </span>
          <h3 className="font-semibold text-ts-text-primary leading-snug pt-0.5">
            {useCase.title}
          </h3>
        </div>
      </div>

      {/* Description */}
      <div className="px-5 pt-3 pb-4">
        <p className="text-sm text-ts-text-secondary leading-relaxed">
          {useCase.description}
        </p>
      </div>

      {/* Adobe Products — prominent row */}
      {useCase.adobeProducts.length > 0 && (
        <div className="px-5 pb-4 flex flex-wrap gap-2">
          {useCase.adobeProducts.map((product) => (
            <span
              key={product}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-adobe-red bg-adobe-red/10 border border-adobe-red/20 rounded-lg px-3 py-1.5"
            >
              <Sparkles className="w-3 h-3" />
              {product}
            </span>
          ))}
        </div>
      )}

      {/* Business Value — separated section */}
      <div className="border-t border-ts-border/40 px-5 py-3.5 bg-ts-surface-light/30">
        <p className="text-[11px] uppercase tracking-wider text-ts-text-secondary font-semibold mb-1">
          Business Value
        </p>
        <p className="text-xs text-ts-text-primary leading-relaxed">
          {useCase.businessValue}
        </p>
      </div>

      {/* Implementation Hint */}
      {useCase.implementationHint && (
        <div className="border-t border-ts-border/30 px-5 py-3 flex items-start gap-2">
          <Lightbulb className="w-3.5 h-3.5 text-ts-warning shrink-0 mt-0.5" />
          <p className="text-xs text-ts-text-secondary italic leading-relaxed">
            {useCase.implementationHint}
          </p>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { RefreshCw, ChevronRight, Clock } from 'lucide-react';
import type { AnalysisResult } from '../types/analysis';
import ResultsTable from './ResultsTable';
import UseCaseDiscovery from './UseCaseDiscovery';
import DownloadButton from './DownloadButton';
import SpotlightCard from './SpotlightCard';
import { useUseCaseDiscovery } from '../hooks/useUseCaseDiscovery';

gsap.registerPlugin(useGSAP);

interface AnalysisSummary {
  id: number;
  url: string;
  analyzedAt: string;
  createdAt: string;
}

function getDomain(url: string): string {
  try {
    const u = new URL(url);
    let host = u.hostname;
    if (host.startsWith('www.')) host = host.slice(4);
    return host || url;
  } catch {
    return url;
  }
}

function getFaviconUrl(url: string): string {
  const domain = getDomain(url);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PastAnalyses({
  onSelectNew,
  refreshTrigger = 0,
}: {
  onSelectNew: () => void;
  refreshTrigger?: number;
}) {
  const [summaries, setSummaries] = useState<AnalysisSummary[]>([]);
  const [selected, setSelected] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);
  const {
    discover: discoverUseCases,
    loading: useCaseLoading,
    result: useCaseResult,
    error: useCaseError,
  } = useUseCaseDiscovery();

  const fetchAnalyses = useCallback(() => {
    setLoading(true);
    setError('');
    fetch('/api/analyses', { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (r.ok) return data;
        throw new Error(data.detail || data.error || 'Failed');
      })
      .then(setSummaries)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load analyses.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount/refresh
    fetchAnalyses();
  }, [fetchAnalyses, refreshTrigger]);

  useGSAP(
    () => {
      if (!gridRef.current || loading || summaries.length === 0) return;
      const cards = gridRef.current.querySelectorAll(':scope > *');
      gsap.fromTo(
        cards,
        { opacity: 0, y: 24, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.1, ease: 'power3.out' },
      );
    },
    { dependencies: [summaries, loading], scope: gridRef },
  );

  const loadAnalysis = (id: number) => {
    fetch(`/api/analyses/${id}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setSelected)
      .catch(() => setError('Failed to load analysis.'));
  };

  // Limit to last 3 analyses
  const recentSummaries = summaries.slice(0, 3);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="flex items-center gap-3 text-ts-text-secondary">
          <div className="w-5 h-5 border-2 border-ts-accent/30 border-t-ts-accent rounded-full animate-spin" />
          Loading analyses...
        </div>
      </div>
    );
  }

  if (error && summaries.length === 0) {
    return (
      <div className="text-center py-16 text-ts-text-secondary text-sm">
        {error}
      </div>
    );
  }

  if (selected) {
    return (
      <div className="w-screen relative left-1/2 -ml-[50vw]">
        <div className="max-w-7xl mx-auto px-6 space-y-4">
          <button
            onClick={() => setSelected(null)}
            className="text-ts-accent hover:text-ts-accent-light text-sm font-medium transition-colors"
          >
            &larr; Back to list
          </button>
          <ResultsTable results={selected} />
          <UseCaseDiscovery
            analysis={selected}
            onDiscover={() => discoverUseCases(selected)}
            loading={useCaseLoading}
            result={useCaseResult}
            error={useCaseError}
          />
          <DownloadButton results={selected} onReset={() => setSelected(null)} />
          <div className="h-20" />
        </div>
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-ts-surface-card border border-ts-border flex items-center justify-center mb-6">
          <Clock className="w-7 h-7 text-ts-text-secondary/50" />
        </div>
        <h3 className="text-lg font-semibold text-ts-text-primary mb-2">No analyses yet</h3>
        <p className="text-sm text-ts-text-secondary max-w-sm">
          Run your first analysis to see results here. Switch to the Analyzer tab to get started.
        </p>
        <button
          onClick={onSelectNew}
          className="mt-6 px-5 py-2.5 bg-gradient-to-r from-adobe-red to-adobe-red-dark text-white font-semibold rounded-xl hover:from-adobe-red-dark hover:to-[#B03522] transition-all hover:shadow-glow-red hover:scale-[1.02] active:scale-[0.98] text-sm"
        >
          Start Analyzing
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ts-text-secondary">
          Showing the {recentSummaries.length} most recent {recentSummaries.length === 1 ? 'analysis' : 'analyses'}
        </p>
        <button
          onClick={fetchAnalyses}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-ts-text-secondary hover:text-ts-text-primary font-medium px-3 py-1.5 rounded-lg hover:bg-ts-surface-card border border-transparent hover:border-ts-border transition-all"
          title="Refresh list"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      <div ref={gridRef} className="grid grid-cols-1 gap-4">
        {recentSummaries.map((s) => (
          <SpotlightCard
            key={s.id}
            className="bg-ts-surface-card rounded-2xl border border-ts-border hover:border-ts-accent/40 transition-all duration-300 cursor-pointer group"
            spotlightColor="rgba(139, 143, 160, 0.06)"
          >
            <button
              onClick={() => loadAnalysis(s.id)}
              className="w-full text-left p-6"
            >
              <div className="flex items-center gap-4">
                <div className="shrink-0 w-12 h-12 rounded-xl bg-ts-surface-light border border-ts-border flex items-center justify-center overflow-hidden">
                  <img
                    src={getFaviconUrl(s.url)}
                    alt=""
                    className="w-7 h-7"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement!.innerHTML = '<span class="flex items-center justify-center w-7 h-7"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-6 h-6 text-ts-text-secondary"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span>';
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-lg font-bold text-ts-text-primary truncate">
                    {getDomain(s.url)}
                  </span>
                  <span className="flex items-center gap-1.5 text-ts-text-secondary text-sm mt-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDate(s.analyzedAt)}
                  </span>
                </div>
                <ChevronRight className="w-5 h-5 text-ts-text-secondary/30 group-hover:text-ts-accent group-hover:translate-x-1 transition-all duration-200 shrink-0" />
              </div>
            </button>
          </SpotlightCard>
        ))}
      </div>
    </div>
  );
}

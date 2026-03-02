import { useState, useEffect, useCallback, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Globe, RefreshCw, Plus } from 'lucide-react';
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
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
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
        { opacity: 0, y: 20, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.4, stagger: 0.06, ease: 'power3.out' },
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

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="flex items-center gap-3 text-ts-text-secondary">
          <div className="w-5 h-5 border-2 border-ts-accent/30 border-t-ts-accent rounded-full animate-spin" />
          Loading analyses...
        </div>
      </div>
    );
  }

  if (error && summaries.length === 0) {
    return (
      <div className="text-center py-8 text-ts-text-secondary text-sm">
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
      <div className="text-center py-8 text-ts-text-secondary text-sm">
        No analyses yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-ts-text-primary">
          Past Analyses
        </h3>
        <div className="flex gap-2">
          <button
            onClick={fetchAnalyses}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm text-ts-text-secondary hover:text-ts-text-primary font-medium p-1.5 rounded-lg hover:bg-ts-surface-card transition-all"
            title="Refresh list"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onSelectNew}
            className="flex items-center gap-1.5 text-sm text-ts-accent hover:text-ts-accent-light font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            New Analysis
          </button>
        </div>
      </div>
      <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {summaries.map((s) => (
          <SpotlightCard
            key={s.id}
            className="bg-ts-surface-card rounded-xl border border-ts-border hover:border-ts-accent/30 transition-all duration-300 cursor-pointer"
            spotlightColor="rgba(99, 102, 241, 0.12)"
          >
            <button
              onClick={() => loadAnalysis(s.id)}
              className="w-full text-left p-4"
            >
              <div className="flex items-center gap-3">
                <div className="shrink-0 w-8 h-8 rounded-lg bg-ts-surface-light border border-ts-border flex items-center justify-center overflow-hidden">
                  <img
                    src={getFaviconUrl(s.url)}
                    alt=""
                    className="w-4 h-4"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement!.innerHTML = '<span class="w-4 h-4"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4 text-ts-text-secondary"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span>';
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-ts-text-primary font-semibold truncate">
                    {getDomain(s.url)}
                  </span>
                  <span className="block text-ts-text-secondary text-xs mt-0.5">
                    {new Date(s.analyzedAt).toLocaleString('de-DE')}
                  </span>
                </div>
                <Globe className="w-4 h-4 text-ts-text-secondary/40 shrink-0" />
              </div>
            </button>
          </SpotlightCard>
        ))}
      </div>
    </div>
  );
}

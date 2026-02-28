import { useState, useEffect, useCallback } from 'react';
import type { AnalysisResult } from '../types/analysis';
import ResultsTable from './ResultsTable';
import UseCaseDiscovery from './UseCaseDiscovery';
import DownloadButton from './DownloadButton';
import { useUseCaseDiscovery } from '../hooks/useUseCaseDiscovery';

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
    fetchAnalyses();
  }, [fetchAnalyses, refreshTrigger]);

  const loadAnalysis = (id: number) => {
    fetch(`/api/analyses/${id}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setSelected)
      .catch(() => setError('Failed to load analysis.'));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-pulse text-ts-text-secondary">
          Loading analyses…
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
            className="text-ts-accent hover:text-ts-accent-light text-sm font-medium"
          >
            ← Back to list
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
            className="text-sm text-ts-text-secondary hover:text-ts-text-primary font-medium p-1"
            title="Refresh list"
          >
            ↻
          </button>
          <button
            onClick={onSelectNew}
            className="text-sm text-ts-accent hover:text-ts-accent-light font-medium"
          >
            + New Analysis
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {summaries.map((s) => (
          <button
            key={s.id}
            onClick={() => loadAnalysis(s.id)}
            className="group text-left p-4 rounded-xl border border-ts-border bg-ts-surface-card hover:bg-ts-surface-hover hover:border-ts-border/80 transition-all"
          >
            <span className="block text-ts-text-primary font-semibold truncate">
              {getDomain(s.url)}
            </span>
            <span className="block text-ts-text-secondary text-sm mt-1">
              {new Date(s.analyzedAt).toLocaleString('de-DE')}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

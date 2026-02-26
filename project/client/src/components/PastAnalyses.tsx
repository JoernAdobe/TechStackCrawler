import { useState, useEffect, useCallback } from 'react';
import type { AnalysisResult } from '../types/analysis';
import ResultsTable from './ResultsTable';
import DownloadButton from './DownloadButton';

interface AnalysisSummary {
  id: number;
  url: string;
  analyzedAt: string;
  createdAt: string;
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
      .catch((e) => setError(e instanceof Error ? e.message : 'Analysen konnten nicht geladen werden.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAnalyses();
  }, [fetchAnalyses, refreshTrigger]);

  const loadAnalysis = (id: number) => {
    fetch(`/api/analyses/${id}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setSelected)
      .catch(() => setError('Analyse konnte nicht geladen werden.'));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-pulse text-ts-text-secondary">
          Lade Analysen…
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
      <div className="space-y-4">
        <button
          onClick={() => setSelected(null)}
          className="text-ts-accent hover:text-ts-accent-light text-sm font-medium"
        >
          ← Zurück zur Liste
        </button>
        <ResultsTable results={selected} />
        <DownloadButton results={selected} onReset={() => setSelected(null)} />
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="text-center py-8 text-ts-text-secondary text-sm">
        Noch keine Analysen vorhanden.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-ts-text-primary">
          Bestehende Analysen
        </h3>
        <div className="flex gap-2">
          <button
            onClick={fetchAnalyses}
            disabled={loading}
            className="text-sm text-ts-text-secondary hover:text-ts-text-primary font-medium p-1"
            title="Liste aktualisieren"
          >
            ↻
          </button>
          <button
            onClick={onSelectNew}
            className="text-sm text-ts-accent hover:text-ts-accent-light font-medium"
          >
            + Neue Analyse
          </button>
        </div>
      </div>
      <ul className="divide-y divide-ts-border rounded-xl border border-ts-border bg-ts-surface-card overflow-hidden">
        {summaries.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => loadAnalysis(s.id)}
              className="w-full px-4 py-3 text-left hover:bg-ts-surface-hover transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
            >
              <span className="text-ts-text-primary truncate font-medium">
                {s.url}
              </span>
              <span className="text-ts-text-secondary text-sm">
                {new Date(s.analyzedAt).toLocaleString('de-DE')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

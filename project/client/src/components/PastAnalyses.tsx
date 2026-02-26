import { useState, useEffect } from 'react';
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
}: {
  onSelectNew: () => void;
}) {
  const [summaries, setSummaries] = useState<AnalysisSummary[]>([]);
  const [selected, setSelected] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/analyses')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed'))))
      .then(setSummaries)
      .catch(() => setError('Analysen konnten nicht geladen werden.'))
      .finally(() => setLoading(false));
  }, []);

  const loadAnalysis = (id: number) => {
    fetch(`/api/analyses/${id}`)
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
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-ts-text-primary">
          Bestehende Analysen
        </h3>
        <button
          onClick={onSelectNew}
          className="text-sm text-ts-accent hover:text-ts-accent-light font-medium"
        >
          + Neue Analyse
        </button>
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

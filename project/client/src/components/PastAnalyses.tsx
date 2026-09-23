import { useState, useEffect, useCallback, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { RefreshCw, ChevronRight, Clock, Globe } from 'lucide-react';
import type { AnalysisResult } from '../types/analysis';
import ResultsTable from './ResultsTable';
import UseCaseDiscovery from './UseCaseDiscovery';
import DownloadButton from './DownloadButton';
import SpotlightCard from './SpotlightCard';
import { useUseCaseDiscovery } from '../hooks/useUseCaseDiscovery';
import { apiRequest, isAbortError, toErrorMessage } from '../lib/apiClient';

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

/**
 * Favicon mit Platzhalter, falls das Icon nicht geladen werden kann.
 * Der Fallback läuft bewusst über React-State statt über direkte
 * DOM-Manipulation (vorher: `parentElement.innerHTML = ...`).
 */
function Favicon({ url }: { url: string }) {
  // Statt eines Reset-Effects wird die fehlgeschlagene URL gespeichert: Wechselt `url`,
  // greift der Fallback automatisch nicht mehr.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = failedUrl === url;

  if (failed) {
    return (
      <span className="flex items-center justify-center w-7 h-7" aria-hidden="true">
        <Globe className="w-6 h-6 text-ts-text-secondary" strokeWidth={1.5} />
      </span>
    );
  }

  return (
    <img
      src={getFaviconUrl(url)}
      alt=""
      className="w-7 h-7"
      onError={() => { setFailedUrl(url); }}
    />
  );
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

  const abortRef = useRef<AbortController | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reloadAnalyses = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- gewollter Data-Fetch bei Mount/Refresh
    setLoading(true);
    setError('');

    apiRequest<AnalysisSummary[]>('/api/analyses', {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-store' },
    })
      .then((data) => {
        if (!controller.signal.aborted) setSummaries(data);
      })
      .catch((e: unknown) => {
        if (!isAbortError(e) && !controller.signal.aborted) {
          setError(toErrorMessage(e, 'Failed to load analyses.'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [refreshTrigger, reloadKey]);

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
    const controller = abortRef.current;
    apiRequest<AnalysisResult>(`/api/analyses/${id}`, {
      signal: controller?.signal,
      headers: { 'Cache-Control': 'no-store' },
    })
      .then((data) => {
        if (!controller?.signal.aborted) setSelected(data);
      })
      .catch((e: unknown) => {
        if (!isAbortError(e) && !controller?.signal.aborted) setError('Failed to load analysis.');
      });
  };

  // Limit to last 3 analyses
  const recentSummaries = summaries.slice(0, 3);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div role="status" aria-live="polite" className="flex items-center gap-3 text-ts-text-secondary">
          <div className="w-5 h-5 border-2 border-ts-accent/30 border-t-ts-accent rounded-full animate-spin" />
          Loading analyses...
        </div>
      </div>
    );
  }

  if (error && summaries.length === 0) {
    return (
      <div role="alert" className="text-center py-16 text-ts-text-secondary text-sm">
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
          onClick={reloadAnalyses}
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
                  <Favicon url={s.url} />
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

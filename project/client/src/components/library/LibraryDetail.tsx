import { useState } from 'react';
import { AlertTriangle, ArrowLeft, Clock, Loader2, RefreshCw } from 'lucide-react';
import type { AnalysisResult } from '../../types/analysis';
import type { BriefingSectionId } from '../../types/briefing';
import type { LibraryAccount } from '../../types/library';
import ResultsTable from '../ResultsTable';
import UseCaseDiscovery from '../UseCaseDiscovery';
import DownloadButton from '../DownloadButton';
import ParityExtras from '../ParityExtras';
import TechCaseInsights from '../TechCaseInsights';
import ResultsSectionNav from '../ResultsSectionNav';
import BriefingPanel from '../briefing/BriefingPanel';
import ErrorBoundary from '../ErrorBoundary';
import { includesBriefing, useUseCaseDiscovery } from '../../hooks/useUseCaseDiscovery';
import { STALE_AFTER_DAYS, accountKeyForUrl, ageInDays, formatDate, relativeAge } from '../../lib/library';
import { BriefingScoreBadge, Favicon } from './AccountBits';
import ReanalyzePanel from './ReanalyzePanel';

interface LibraryDetailProps {
  analysis: AnalysisResult;
  account?: LibraryAccount;
  switchingId: number | null;
  onBack: () => void;
  onSelectVersion: (analysisId: number) => void;
  onReanalyze: (url: string, briefingSections: BriefingSectionId[] | null) => void;
}

/** Account-Seite in der Library: gespeicherte Analyse + Versionswahl + „Re-analyze“. */
export default function LibraryDetail({
  analysis, account, switchingId, onBack, onSelectVersion, onReanalyze,
}: LibraryDetailProps) {
  const [showReanalyze, setShowReanalyze] = useState(false);
  const {
    discover: discoverUseCases,
    loading: useCaseLoading,
    result: useCaseResult,
    error: useCaseError,
    autoRunning: useCaseAutoRunning,
    briefingPending: useCaseBriefingPending,
  } = useUseCaseDiscovery(analysis);

  const name = account?.name ?? accountKeyForUrl(analysis.url);
  const isLatest = !account || account.latest.id === analysis.id;
  const stale = ageInDays(analysis.analyzedAt) >= STALE_AFTER_DAYS;
  const reanalyzeUrl = account?.latest.url ?? analysis.url;

  return (
    <div>
      <ResultsSectionNav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-ts-accent-light hover:text-white text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to library
        </button>

        <div className="mt-4 rounded-2xl border border-ts-border bg-ts-surface-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="shrink-0 w-12 h-12 rounded-xl bg-ts-surface-light border border-ts-border flex items-center justify-center overflow-hidden">
              <Favicon url={analysis.url} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-ts-text-primary truncate">{name}</h2>
                <BriefingScoreBadge briefing={account?.analyses.find((a) => a.id === analysis.id)?.briefing} />
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ts-text-secondary">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  Analyzed {formatDate(analysis.analyzedAt)} ({relativeAge(analysis.analyzedAt)})
                </span>
                {!isLatest && <span className="text-ts-warning">· older version</span>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {account && account.analysisCount > 1 && (
                <label className="flex items-center gap-2 text-xs text-ts-text-secondary">
                  <span className="sr-only sm:not-sr-only">Version</span>
                  <select
                    value={analysis.id}
                    onChange={(e) => onSelectVersion(Number(e.target.value))}
                    disabled={switchingId !== null}
                    className="rounded-lg border border-ts-border bg-ts-surface-light px-2 py-1.5 text-xs text-ts-text-primary focus:outline-none focus:border-ts-accent"
                  >
                    {account.analyses.map((a, i) => (
                      <option key={a.id} value={a.id}>
                        {formatDate(a.analyzedAt)}
                        {i === 0 ? ' (latest)' : ''}
                        {a.briefing?.status === 'done' && a.briefing.overallScore != null ? ` · PB ${Math.round(a.briefing.overallScore)}` : ''}
                      </option>
                    ))}
                  </select>
                  {switchingId !== null && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                </label>
              )}
              <button
                type="button"
                onClick={() => setShowReanalyze((v) => !v)}
                aria-expanded={showReanalyze}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-adobe-red/50 text-ts-text-primary hover:bg-adobe-red/10 transition-colors"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                Re-analyze
              </button>
            </div>
          </div>
          {stale && !showReanalyze && (
            <p className="mt-3 flex items-center gap-2 text-xs text-ts-warning">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              This analysis is older than {STALE_AFTER_DAYS} days – consider re-analyzing for current data.
            </p>
          )}
          {showReanalyze && (
            <ReanalyzePanel
              url={reanalyzeUrl}
              defaultBriefing={Boolean(account?.briefing)}
              onStart={onReanalyze}
              onClose={() => setShowReanalyze(false)}
            />
          )}
        </div>
      </div>

      <ErrorBoundary label="Client Pre-Briefing" resetKey={analysis}>
        <BriefingPanel key={analysis.id ?? 'none'} analysisId={analysis.id} />
      </ErrorBoundary>
      <ErrorBoundary label="Results table" resetKey={analysis}>
        <ResultsTable results={analysis} />
      </ErrorBoundary>
      <ErrorBoundary label="Use case discovery" resetKey={analysis}>
        <UseCaseDiscovery
          analysis={analysis}
          onDiscover={() => discoverUseCases(analysis)}
          loading={useCaseLoading}
          result={useCaseResult}
          error={useCaseError}
          autoRunning={useCaseAutoRunning}
          briefingPending={useCaseBriefingPending}
        />
      </ErrorBoundary>
      <ErrorBoundary label="Tech case insights" resetKey={analysis}>
        <TechCaseInsights
          analysis={useCaseResult ? { ...analysis, useCaseDiscovery: useCaseResult } : analysis}
        />
      </ErrorBoundary>
      <ErrorBoundary label="Deep dive" resetKey={analysis}>
        <ParityExtras analysis={analysis} />
      </ErrorBoundary>
      <DownloadButton
        results={analysis}
        onReset={onBack}
        resetLabel="Back to library"
        useCases={useCaseResult}
        useCasesPending={useCaseLoading || useCaseAutoRunning || (useCaseBriefingPending && !includesBriefing(useCaseResult))}
      />
      <div className="h-20" />
    </div>
  );
}

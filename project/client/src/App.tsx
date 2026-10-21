import { useState, useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import UrlInput from './components/UrlInput';
import AnalysisProgress from './components/AnalysisProgress';
import ResultsTable from './components/ResultsTable';
import UseCaseDiscovery from './components/UseCaseDiscovery';
import TechCaseInsights from './components/TechCaseInsights';
import DownloadButton from './components/DownloadButton';
import Library from './components/library/Library';
import { useLibrary } from './hooks/useLibrary';
import AnimatedView from './components/AnimatedView';
import DashboardLogin from './components/DashboardLogin';
import Dashboard from './components/Dashboard';
import BatchAssessment from './components/BatchAssessment';
import ParityExtras from './components/ParityExtras';
import DeckButton from './components/DeckButton';
import ResultsSectionNav from './components/ResultsSectionNav';
import ErrorBoundary from './components/ErrorBoundary';
import ScanWarningsBanner from './components/ScanWarningsBanner';
import BriefingPanel from './components/briefing/BriefingPanel';
import { TooltipProvider } from './components/ui/tooltip';
import { useAnalysis, type AnalysisErrorInfo } from './hooks/useAnalysis';
import AnalysisError from './components/AnalysisError';
import { useUseCaseDiscovery } from './hooks/useUseCaseDiscovery';
import { useStaticAudio } from './hooks/useStaticAudio';
import { Search, BookOpen, Layers } from 'lucide-react';
import { apiRequest, isAbortError } from './lib/apiClient';
import type { AnalysisResult, ProgressEvent, AppState } from './types/analysis';
import type { BriefingSectionId } from './types/briefing';

type TabId = 'analyzer' | 'library' | 'batch';

const TABS: Array<{ id: TabId; label: string; icon: typeof Search }> = [
  { id: 'analyzer', label: 'Analyzer', icon: Search },
  { id: 'library', label: 'Library', icon: BookOpen },
  { id: 'batch', label: 'Account / Bulk', icon: Layers },
];

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return hash;
}

function App() {
  const hash = useHashRoute();
  const [dashboardToken, setDashboardToken] = useState<string | null>(
    () => sessionStorage.getItem('dashboard_token'),
  );
  // Okta-Session-Status (Cookie-basiert, ohne sessionStorage-Token).
  const [oktaSession, setOktaSession] = useState<
    { authenticated: boolean; isAdmin: boolean } | null
  >(null);

  const isDashboard = hash === '#/dashboard';

  // Beim Betreten des Dashboards die Cookie-Session prüfen (Okta-Login liefert
  // keinen sessionStorage-Token, nur ein httpOnly-Cookie).
  useEffect(() => {
    if (!isDashboard) return;
    const controller = new AbortController();

    apiRequest<{ authenticated?: boolean; isAdmin?: boolean }>('/api/dashboard/session', {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setOktaSession({
            authenticated: Boolean(data.authenticated),
            isAdmin: Boolean(data.isAdmin),
          });
        }
      })
      .catch((err: unknown) => {
        if (!isAbortError(err) && !controller.signal.aborted) {
          setOktaSession({ authenticated: false, isAdmin: false });
        }
      });

    return () => controller.abort();
  }, [isDashboard]);

  const handleDashboardLogin = useCallback((token: string) => {
    sessionStorage.setItem('dashboard_token', token);
    setDashboardToken(token);
  }, []);

  const handleDashboardLogout = useCallback(() => {
    sessionStorage.removeItem('dashboard_token');
    setDashboardToken(null);
    setOktaSession({ authenticated: false, isAdmin: false });
    // Okta-/Server-Session + Cookie serverseitig aufräumen (Fehler ignorieren).
    void apiRequest('/auth/logout').catch(() => {});
  }, []);

  if (isDashboard) {
    // Break-Glass-Token vorhanden → direkt ins Dashboard.
    if (dashboardToken) {
      return <Dashboard token={dashboardToken} onLogout={handleDashboardLogout} />;
    }
    // Cookie-Session-Check läuft noch.
    if (oktaSession === null) {
      return (
        <div className="min-h-screen bg-ts-surface flex items-center justify-center">
          <div className="animate-pulse text-ts-text-secondary">Checking session…</div>
        </div>
      );
    }
    // Per Okta angemeldet und Admin → Dashboard (ohne sessionStorage-Token).
    if (oktaSession.authenticated && oktaSession.isAdmin) {
      return <Dashboard token="" onLogout={handleDashboardLogout} />;
    }
    // Angemeldet, aber nicht als Admin freigeschaltet.
    if (oktaSession.authenticated && !oktaSession.isAdmin) {
      return (
        <div className="min-h-screen bg-ts-surface flex items-center justify-center px-4">
          <div className="w-full max-w-sm text-center">
            <h1 className="text-xl font-bold text-ts-text-primary mb-2">Kein Zugriff</h1>
            <p className="text-sm text-ts-text-secondary mb-6">
              Dein Adobe-Konto ist nicht als Admin für dieses Dashboard freigeschaltet.
            </p>
            <button
              onClick={handleDashboardLogout}
              className="text-sm text-ts-accent hover:underline"
            >
              Logout
            </button>
          </div>
        </div>
      );
    }
    return <DashboardLogin onLogin={handleDashboardLogin} />;
  }

  return (
    <TooltipProvider>
      <ErrorBoundary label="TechStack Analyzer">
        <Analyzer />
      </ErrorBoundary>
    </TooltipProvider>
  );
}

function Analyzer() {
  const [state, setState] = useState<AppState>('idle');
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const [error, setError] = useState<AnalysisErrorInfo | null>(null);
  // Zuletzt abgeschickte Eingabe (für „Try Again“) und Vorbelegung des Eingabefelds („Edit URL“).
  const [lastUrl, setLastUrl] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  // Abschnitte für das Client Pre-Briefing, das nach Abschluss der Analyse automatisch startet.
  const [pendingBriefing, setPendingBriefing] = useState<BriefingSectionId[] | null>(null);
  const welcomePlayedRef = useRef(false);
  const [userInteracted, setUserInteracted] = useState(false);
  const [analysesRefreshTrigger, setAnalysesRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState<TabId>('analyzer');
  const { playStatic } = useStaticAudio();
  const library = useLibrary(analysesRefreshTrigger);

  // WAI-ARIA Tabs: Pfeiltasten wechseln den Tab, Fokus wandert mit.
  const handleTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const idx = TABS.findIndex((t) => t.id === activeTab);
    const next = TABS[(idx + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    setActiveTab(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  useEffect(() => {
    const handler = () => setUserInteracted(true);
    document.addEventListener('click', handler, { once: true });
    document.addEventListener('keydown', handler, { once: true });
    document.addEventListener('touchstart', handler, { once: true });
    return () => {
      document.removeEventListener('click', handler);
      document.removeEventListener('keydown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  useEffect(() => {
    if (userInteracted && state === 'idle' && !welcomePlayedRef.current) {
      welcomePlayedRef.current = true;
      playStatic('welcome');
    }
  }, [userInteracted, state, playStatic]);

  const handleProgress = useCallback((event: ProgressEvent) => {
    setProgress((prev) => [...prev, event]);
  }, []);

  const handleComplete = useCallback(
    (result: AnalysisResult) => {
      setResults(result);
      setState('results');
      setAnalysesRefreshTrigger((t) => t + 1);
      playStatic('analysis-complete');
    },
    [playStatic],
  );

  const clearPendingBriefing = useCallback(() => setPendingBriefing(null), []);

  const handleError = useCallback((info: AnalysisErrorInfo) => {
    setError(info);
    setState('error');
  }, []);

  const { startAnalysis, cancel } = useAnalysis({
    onProgress: handleProgress,
    onComplete: handleComplete,
    onError: handleError,
  });

  const {
    discover: discoverUseCases,
    loading: useCaseLoading,
    result: useCaseResult,
    error: useCaseError,
    reset: resetUseCases,
    autoRunning: useCaseAutoRunning,
    briefingPending: useCaseBriefingPending,
  } = useUseCaseDiscovery(results);

  const handleSubmit = (url: string, briefingSections: BriefingSectionId[] | null = null) => {
    // Doppeltes Absenden (Doppelklick, Enter-Repeat) ignorieren.
    if (state === 'analyzing') return;
    setPendingBriefing(briefingSections);
    setLastUrl(url);
    setDraftUrl(url);
    setState('analyzing');
    setProgress([]);
    setResults(null);
    setError(null);
    resetUseCases();
    startAnalysis(url);
  };

  const handleReset = () => {
    cancel();
    resetUseCases();
    setState('idle');
    setProgress([]);
    setResults(null);
    setError(null);
    setDraftUrl('');
    setPendingBriefing(null);
  };

  // Abbrechen/„Edit URL“: zurück zur Eingabe, die eingegebene URL bleibt erhalten.
  const handleEditUrl = () => {
    cancel();
    setState('idle');
    setActiveTab('analyzer');
    setProgress([]);
    setError(null);
    setDraftUrl(lastUrl);
  };

  // Seite verlassen/neu laden während einer laufenden Analyse → Browser-Rückfrage.
  useEffect(() => {
    if (state !== 'analyzing') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [state]);

  // EAA-Parität: Analyse aus einem Account-/Bulk-Assessment öffnen.
  const handleOpenAnalysis = useCallback(
    async (analysisId: number) => {
      try {
        const data = await apiRequest<AnalysisResult>(`/api/analyses/${analysisId}`);
        resetUseCases();
        setPendingBriefing(null);
        setResults(data);
        setState('results');
        window.scrollTo({ top: 0 });
      } catch (err) {
        setLastUrl('');
        setError({ message: err instanceof Error ? err.message : String(err) });
        setState('error');
      }
    },
    [resetUseCases],
  );

  return (
    <div className="min-h-screen bg-ts-surface text-ts-text-primary">
      <Header />

      {state === 'idle' && (
        <AnimatedView key="idle">
          {/* Tab Navigation */}
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6">
            <div
              role="tablist"
              aria-label="Analyzer views"
              onKeyDown={handleTabKeyDown}
              className="flex gap-1 shadow-[inset_0_-1px_0_var(--color-ts-border)] overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  role="tab"
                  id={`tab-${id}`}
                  aria-selected={activeTab === id}
                  aria-controls={`tabpanel-${id}`}
                  tabIndex={activeTab === id ? 0 : -1}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-2 px-3 sm:px-5 py-3 text-sm font-semibold whitespace-nowrap transition-all duration-200 border-b-2 focus-visible:outline-offset-[-2px] ${
                    activeTab === id
                      ? 'border-adobe-red text-ts-text-primary'
                      : 'border-transparent text-ts-text-secondary hover:text-ts-text-primary hover:border-ts-border'
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
          {activeTab === 'batch' ? (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
              <BatchAssessment
                onOpenAnalysis={handleOpenAnalysis}
                renderExtraActions={(batch) => (
                  <DeckButton href={`/api/batches/${batch.id}/deck.pptx`} label="Download Deck" />
                )}
              />
            </div>
          ) : activeTab === 'analyzer' ? (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
              <UrlInput
                key={draftUrl}
                onSubmit={handleSubmit}
                initialValue={draftUrl}
                existingAccounts={library.data?.accounts}
                onOpenExisting={(id) => void handleOpenAnalysis(id)}
              />
            </div>
          ) : (
            <div className="py-8">
              <Library
                data={library.data}
                loading={library.loading}
                error={library.error}
                onReload={library.reload}
                onSelectNew={() => setActiveTab('analyzer')}
                onReanalyze={(url, sections) => handleSubmit(url, sections)}
              />
            </div>
          )}
          </div>
        </AnimatedView>
      )}

      {state === 'analyzing' && (
        <AnimatedView key="analyzing">
          <AnalysisProgress events={progress} onCancel={handleEditUrl} />
        </AnimatedView>
      )}

      {state === 'results' && results && (
        <AnimatedView key="results">
          {/* Robustheit: je Bereich eine ErrorBoundary, Scan-Warnungen als Banner */}
          <ResultsSectionNav />
          <ScanWarningsBanner warnings={results.scanWarnings} />
          <ErrorBoundary label="Client Pre-Briefing" resetKey={results}>
            <BriefingPanel
              key={results.id ?? 'none'}
              analysisId={results.id}
              autoStartSections={pendingBriefing}
              onAutoStartConsumed={clearPendingBriefing}
            />
          </ErrorBoundary>
          <ErrorBoundary label="Results table" resetKey={results}>
            <ResultsTable results={results} />
          </ErrorBoundary>
          <ErrorBoundary label="Use case discovery" resetKey={results}>
            <UseCaseDiscovery
              analysis={results}
              onDiscover={() => discoverUseCases(results)}
              loading={useCaseLoading}
              result={useCaseResult}
              error={useCaseError}
              autoRunning={useCaseAutoRunning}
              briefingPending={useCaseBriefingPending}
            />
          </ErrorBoundary>
          <ErrorBoundary label="Tech case insights" resetKey={results}>
            <TechCaseInsights
              analysis={useCaseResult ? { ...results, useCaseDiscovery: useCaseResult } : results}
            />
          </ErrorBoundary>
          <ErrorBoundary label="Deep dive" resetKey={results}>
            <ParityExtras analysis={results} />
          </ErrorBoundary>
          <ErrorBoundary label="Download" resetKey={results}>
            <DownloadButton results={results} onReset={handleReset} />
          </ErrorBoundary>
          <div className="h-20" />
        </AnimatedView>
      )}

      {state === 'error' && error && (
        <AnimatedView key="error">
          <AnalysisError
            error={error}
            url={lastUrl}
            onRetry={() => (lastUrl ? handleSubmit(lastUrl, pendingBriefing) : handleReset())}
            onEdit={handleEditUrl}
            onSuggestion={(url) => handleSubmit(url, pendingBriefing)}
          />
        </AnimatedView>
      )}

      <Footer />
    </div>
  );
}

export default App;

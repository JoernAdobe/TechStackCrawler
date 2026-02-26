import { useState, useCallback, useEffect, useRef } from 'react';
import Header from './components/Header';
import UrlInput from './components/UrlInput';
import AnalysisProgress from './components/AnalysisProgress';
import ResultsTable from './components/ResultsTable';
import UseCaseDiscovery from './components/UseCaseDiscovery';
import DownloadButton from './components/DownloadButton';
import PastAnalyses from './components/PastAnalyses';
import { useAnalysis } from './hooks/useAnalysis';
import { useUseCaseDiscovery } from './hooks/useUseCaseDiscovery';
import { useStaticAudio } from './hooks/useStaticAudio';
import type { AnalysisResult, ProgressEvent, AppState } from './types/analysis';

function App() {
  const [state, setState] = useState<AppState>('idle');
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const welcomePlayedRef = useRef(false);
  const [userInteracted, setUserInteracted] = useState(false);
  const [analysesRefreshTrigger, setAnalysesRefreshTrigger] = useState(0);
  const { playStatic } = useStaticAudio();

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

  const handleError = useCallback((message: string) => {
    setErrorMessage(message);
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
  } = useUseCaseDiscovery();

  const handleSubmit = (url: string) => {
    setState('analyzing');
    setProgress([]);
    setResults(null);
    setErrorMessage('');
    resetUseCases();
    startAnalysis(url);
  };

  const handleReset = () => {
    cancel();
    resetUseCases();
    setState('idle');
    setProgress([]);
    setResults(null);
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen bg-ts-surface text-ts-text-primary">
      <Header />

      {state === 'idle' && (
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-12">
          <UrlInput onSubmit={handleSubmit} />
          <section className="border-t border-ts-border pt-12">
            <PastAnalyses onSelectNew={() => {}} refreshTrigger={analysesRefreshTrigger} />
          </section>
        </div>
      )}

      {state === 'analyzing' && (
        <AnalysisProgress events={progress} onCancel={handleReset} />
      )}

      {state === 'results' && results && (
        <>
          <ResultsTable results={results} />
          <UseCaseDiscovery
            analysis={results}
            onDiscover={() => discoverUseCases(results)}
            loading={useCaseLoading}
            result={useCaseResult}
            error={useCaseError}
          />
          <DownloadButton results={results} onReset={handleReset} />
          {/* Bottom padding for fixed download bar */}
          <div className="h-20" />
        </>
      )}

      {state === 'error' && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
          <div className="w-full max-w-md text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-500/10 flex items-center justify-center">
              <span className="text-3xl">❌</span>
            </div>
            <h2 className="text-xl font-semibold mb-2">Analysis Failed</h2>
            <p className="text-ts-text-secondary mb-6">{errorMessage}</p>
            <button
              onClick={handleReset}
              className="px-6 py-3 bg-gradient-to-r from-adobe-red to-red-700 text-white font-semibold rounded-xl hover:from-adobe-red-dark hover:to-red-800 transition-all"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

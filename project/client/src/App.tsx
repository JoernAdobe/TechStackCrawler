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
import { useTts } from './hooks/useTts';
import type { AnalysisResult, ProgressEvent, AppState } from './types/analysis';

// Eleven v3 Audio Tags: [warmly], [happily], [excited], [whispers], [sighs], etc.
const WELCOME_MESSAGE =
  "[warmly] Welcome! I'm Javlyn, and I'm here to help you with your research. [excited] Enter a URL to analyze any website's technology stack.";
const ANALYSIS_COMPLETE_MESSAGE =
  "[happily] Your analysis is complete. I've identified the technologies and opportunities for you. [warmly] Take a look at the results.";

function App() {
  const [state, setState] = useState<AppState>('idle');
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const welcomePlayedRef = useRef(false);
  const { playTts, ttsAvailable } = useTts();

  useEffect(() => {
    if (state === 'idle' && ttsAvailable && !welcomePlayedRef.current) {
      welcomePlayedRef.current = true;
      playTts(WELCOME_MESSAGE);
    }
  }, [state, ttsAvailable, playTts]);

  const handleProgress = useCallback((event: ProgressEvent) => {
    setProgress((prev) => [...prev, event]);
  }, []);

  const handleComplete = useCallback(
    (result: AnalysisResult) => {
      setResults(result);
      setState('results');
      playTts(ANALYSIS_COMPLETE_MESSAGE);
    },
    [playTts],
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
            <PastAnalyses onSelectNew={() => {}} />
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

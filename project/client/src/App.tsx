import { useState, useCallback } from 'react';
import Header from './components/Header';
import UrlInput from './components/UrlInput';
import AnalysisProgress from './components/AnalysisProgress';
import ResultsTable from './components/ResultsTable';
import DownloadButton from './components/DownloadButton';
import { useAnalysis } from './hooks/useAnalysis';
import type { AnalysisResult, ProgressEvent, AppState } from './types/analysis';

function App() {
  const [state, setState] = useState<AppState>('idle');
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  const handleProgress = useCallback((event: ProgressEvent) => {
    setProgress((prev) => [...prev, event]);
  }, []);

  const handleComplete = useCallback((result: AnalysisResult) => {
    setResults(result);
    setState('results');
  }, []);

  const handleError = useCallback((message: string) => {
    setErrorMessage(message);
    setState('error');
  }, []);

  const { startAnalysis, cancel } = useAnalysis({
    onProgress: handleProgress,
    onComplete: handleComplete,
    onError: handleError,
  });

  const handleSubmit = (url: string) => {
    setState('analyzing');
    setProgress([]);
    setResults(null);
    setErrorMessage('');
    startAnalysis(url);
  };

  const handleReset = () => {
    cancel();
    setState('idle');
    setProgress([]);
    setResults(null);
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen bg-ts-surface text-ts-text-primary">
      <Header />

      {state === 'idle' && <UrlInput onSubmit={handleSubmit} />}

      {state === 'analyzing' && (
        <AnalysisProgress events={progress} onCancel={handleReset} />
      )}

      {state === 'results' && results && (
        <>
          <ResultsTable results={results} />
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

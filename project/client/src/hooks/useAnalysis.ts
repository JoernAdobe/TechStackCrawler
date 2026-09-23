import { useRef, useCallback, useState, useEffect } from 'react';
import type { AnalysisResult, ProgressEvent } from '../types/analysis';
import { apiRequest, isAbortError, toErrorMessage } from '../lib/apiClient';

interface UseAnalysisOptions {
  onProgress: (event: ProgressEvent) => void;
  onComplete: (result: AnalysisResult) => void;
  onError: (message: string) => void;
}

interface AnalyzeResponse {
  ok: boolean;
  result?: AnalysisResult;
  error?: string;
  progress?: Array<{ phase?: string; message: string } | string>;
}

/** Abstand zwischen den Platzhalter-Fortschrittsmeldungen. */
const PLACEHOLDER_INTERVAL_MS = 5000;

const PLACEHOLDER_STEPS: Array<{ phase: ProgressEvent['phase']; message: string }> = [
  { phase: 'scraping', message: 'Fetching website…' },
  { phase: 'scraping', message: 'Page is being analyzed…' },
  { phase: 'detecting', message: 'Detecting technologies…' },
  { phase: 'analyzing', message: 'AI is analyzing the tech stack…' },
  { phase: 'analyzing', message: 'Creating summary…' },
  { phase: 'analyzing', message: 'Almost done…' },
];

export function useAnalysis({ onProgress, onComplete, onError }: UseAnalysisOptions) {
  const abortRef = useRef<AbortController | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Laufende Analyse beim Unmount abbrechen. abortRef wird vorher geleert, damit
  // das finally des laufenden Requests kein setState auf der unmounteten Komponente macht.
  useEffect(
    () => () => {
      const controller = abortRef.current;
      abortRef.current = null;
      controller?.abort();
    },
    [],
  );

  const startAnalysis = useCallback(
    async (url: string) => {
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;
      setIsRunning(true);

      let intervalId: ReturnType<typeof setInterval> | undefined;

      try {
        onProgress({ phase: 'scraping', message: 'Analysis starting…', timestamp: Date.now() });

        let placeholderIndex = 0;
        intervalId = setInterval(() => {
          if (placeholderIndex < PLACEHOLDER_STEPS.length) {
            onProgress({ ...PLACEHOLDER_STEPS[placeholderIndex], timestamp: Date.now() });
            placeholderIndex++;
          }
        }, PLACEHOLDER_INTERVAL_MS);

        const data = await apiRequest<AnalyzeResponse>('/api/analyze-sync', {
          method: 'POST',
          body: { url },
          signal: controller.signal,
        });

        if (data.ok && data.result) {
          (data.progress ?? []).forEach((p) => {
            const ev =
              typeof p === 'string'
                ? { phase: 'scraping' as const, message: p }
                : { phase: (p.phase || 'scraping') as ProgressEvent['phase'], message: p.message };
            onProgress({ ...ev, timestamp: Date.now() });
          });
          onProgress({ phase: 'complete', message: 'Done!', timestamp: Date.now() });
          onComplete(data.result);
        } else {
          onError(data.error || 'No result');
        }
      } catch (err) {
        if (!isAbortError(err)) {
          onError(toErrorMessage(err, 'Analysis failed'));
        }
      } finally {
        clearInterval(intervalId);
        // Nur aufräumen, wenn dieser Lauf noch der aktuelle ist: Bei Unmount oder
        // einem nachfolgenden Lauf zeigt abortRef bereits woanders hin.
        if (abortRef.current === controller) {
          abortRef.current = null;
          setIsRunning(false);
        }
      }
    },
    [onProgress, onComplete, onError],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsRunning(false);
  }, []);

  return { startAnalysis, cancel, isRunning };
}

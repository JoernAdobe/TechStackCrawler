import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  AnalysisResult,
  UseCaseDiscoveryResult,
} from '../types/analysis';
import { apiRequest, isAbortError, toErrorMessage } from '../lib/apiClient';

interface UseUseCaseDiscoveryOptions {
  onComplete?: (result: UseCaseDiscoveryResult) => void;
  onError?: (message: string) => void;
}

interface DiscoveryResponse {
  ok: boolean;
  result?: UseCaseDiscoveryResult;
}

export function useUseCaseDiscovery(options: UseUseCaseDiscoveryOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UseCaseDiscoveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { onComplete, onError } = options;
  const abortRef = useRef<AbortController | null>(null);

  // Laufenden Request beim Unmount abbrechen. abortRef wird vorher geleert, damit das
  // finally des laufenden Requests kein setState auf der unmounteten Komponente macht.
  useEffect(
    () => () => {
      const controller = abortRef.current;
      abortRef.current = null;
      controller?.abort();
    },
    [],
  );

  const discover = useCallback(
    async (analysis: AnalysisResult) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const data = await apiRequest<DiscoveryResponse>('/api/use-case-discovery', {
          method: 'POST',
          body: analysis,
          signal: controller.signal,
        });

        if (!data.ok || !data.result) {
          throw new Error('Invalid response from server');
        }

        if (abortRef.current !== controller) return;
        setResult(data.result);
        onComplete?.(data.result);
        return data.result;
      } catch (e) {
        if (isAbortError(e) || abortRef.current !== controller) return;
        const msg = toErrorMessage(e, 'Use case discovery failed');
        setError(msg);
        onError?.(msg);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setLoading(false);
        }
      }
    },
    [onComplete, onError],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  return { discover, loading, result, error, reset };
}

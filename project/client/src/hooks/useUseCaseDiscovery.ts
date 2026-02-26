import { useState, useCallback } from 'react';
import type {
  AnalysisResult,
  UseCaseDiscoveryResult,
} from '../types/analysis';

interface UseUseCaseDiscoveryOptions {
  onComplete?: (result: UseCaseDiscoveryResult) => void;
  onError?: (message: string) => void;
}

export function useUseCaseDiscovery(options: UseUseCaseDiscoveryOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UseCaseDiscoveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const discover = useCallback(
    async (analysis: AnalysisResult) => {
      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const res = await fetch('/api/use-case-discovery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(analysis),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Use case discovery failed');
        }

        if (!data.ok || !data.result) {
          throw new Error('Invalid response from server');
        }

        const discoveryResult = data.result as UseCaseDiscoveryResult;
        setResult(discoveryResult);
        options.onComplete?.(discoveryResult);
        return discoveryResult;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setError(msg);
        options.onError?.(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [options],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  return { discover, loading, result, error, reset };
}

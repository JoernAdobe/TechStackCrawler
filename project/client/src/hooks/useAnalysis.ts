import { useRef, useCallback, useState } from 'react';
import type { AnalysisResult, ProgressEvent } from '../types/analysis';

interface UseAnalysisOptions {
  onProgress: (event: ProgressEvent) => void;
  onComplete: (result: AnalysisResult) => void;
  onError: (message: string) => void;
}

export function useAnalysis({ onProgress, onComplete, onError }: UseAnalysisOptions) {
  const abortRef = useRef<AbortController | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const startAnalysis = useCallback(
    async (url: string) => {
      // Cancel any previous request
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;
      setIsRunning(true);

      try {
        // Sync-Endpoint als Fallback – SSE hat Verbindungsprobleme mit manchen Proxies
        const useSync = true;
        const endpoint = useSync ? '/api/analyze-sync' : '/api/analyze';

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Request failed' }));
          throw new Error(err.error || `HTTP ${response.status}`);
        }

        if (useSync) {
          const data = await response.json();
          if (data.ok && data.result) {
            onProgress({
              phase: 'scraping',
              message: 'Analyse läuft…',
              timestamp: Date.now(),
            });
            (data.progress as string[]).forEach((msg) =>
              onProgress({ phase: 'scraping', message: msg, timestamp: Date.now() }),
            );
            onProgress({
              phase: 'complete',
              message: 'Fertig!',
              timestamp: Date.now(),
            });
            onComplete(data.result as import('../types/analysis').AnalysisResult);
          } else {
            onError(data.error || 'No result');
          }
          return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          let eventType = '';
          let eventData = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              eventData = line.slice(6);
            } else if (line === '' && eventType && eventData) {
              // End of event
              try {
                const parsed = JSON.parse(eventData);
                if (eventType === 'progress') {
                  onProgress(parsed as ProgressEvent);
                } else if (eventType === 'result') {
                  onComplete(parsed as AnalysisResult);
                } else if (eventType === 'error') {
                  onError(parsed.message || 'Unknown error');
                }
              } catch {
                // Skip malformed events
              }
              eventType = '';
              eventData = '';
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          onError((err as Error).message || 'Analysis failed');
        }
      } finally {
        setIsRunning(false);
      }
    },
    [onProgress, onComplete, onError],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  return { startAnalysis, cancel, isRunning };
}

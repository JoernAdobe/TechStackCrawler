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

        if (useSync) {
          // Sofort erste Meldung – sonst bleibt "Live updates" während des Wartens leer
          onProgress({
            phase: 'scraping',
            message: 'Analysis starting…',
            timestamp: Date.now(),
          });

          const placeholders: Array<{ phase: ProgressEvent['phase']; message: string }> = [
            { phase: 'scraping', message: 'Fetching website…' },
            { phase: 'scraping', message: 'Page is being analyzed…' },
            { phase: 'detecting', message: 'Detecting technologies…' },
            { phase: 'analyzing', message: 'AI is analyzing the tech stack…' },
            { phase: 'analyzing', message: 'Creating summary…' },
            { phase: 'analyzing', message: 'Almost done…' },
          ];
          let placeholderIndex = 0;
          const intervalId = setInterval(() => {
            if (placeholderIndex < placeholders.length) {
              onProgress({
                ...placeholders[placeholderIndex],
                timestamp: Date.now(),
              });
              placeholderIndex++;
            }
          }, 5000);

          try {
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

            const data = await response.json();
            if (data.ok && data.result) {
              ((data.progress as Array<{ phase?: string; message: string } | string>) || []).forEach(
                (p) => {
                  const ev =
                    typeof p === 'string'
                      ? { phase: 'scraping' as const, message: p }
                      : {
                          phase: (p.phase || 'scraping') as ProgressEvent['phase'],
                          message: p.message,
                        };
                  onProgress({ ...ev, timestamp: Date.now() });
                },
              );
              onProgress({
                phase: 'complete',
                message: 'Done!',
                timestamp: Date.now(),
              });
              onComplete(data.result as import('../types/analysis').AnalysisResult);
            } else {
              onError(data.error || 'No result');
            }
          } finally {
            clearInterval(intervalId);
          }
          return;
        }

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

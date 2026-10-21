import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  AnalysisResult,
  UseCaseDiscoveryResult,
} from '../types/analysis';
import { apiRequest, isAbortError, isConnectionError, toErrorMessage } from '../lib/apiClient';

interface UseUseCaseDiscoveryOptions {
  onComplete?: (result: UseCaseDiscoveryResult) => void;
  onError?: (message: string) => void;
}

interface DiscoveryResponse {
  ok: boolean;
  result?: UseCaseDiscoveryResult;
}

interface UseCaseStatusResponse {
  status: 'idle' | 'running' | 'done' | 'failed';
  result?: UseCaseDiscoveryResult;
  error?: string;
  /** Ein Pre-Briefing läuft noch – danach folgt ein zweiter Lauf mit dessen Insights. */
  briefingPending?: boolean;
}

/** Polling-Intervall, solange serverseitig etwas läuft bzw. noch ein Pre-Briefing aussteht. */
const ACTIVE_POLL_MS = 4000;
/** Ruhe-Intervall: erkennt später gestartete Briefings/Läufe (z. B. aus einem anderen Tab). */
const IDLE_POLL_MS = 20_000;
const MAX_BACKOFF_MS = 30_000;

/** True, wenn das Ergebnis die Pre-Briefing-Insights bereits enthält. */
export function includesBriefing(result: UseCaseDiscoveryResult | null | undefined): boolean {
  return !!result?.basedOn?.includes('Client Pre-Briefing');
}

/**
 * Use Case Discovery einer Analyse. Für gespeicherte Analysen läuft die Discovery automatisch
 * serverseitig (nach der Analyse und erneut nach dem Pre-Briefing); der Hook pollt den Status
 * und übernimmt neue Ergebnisse. Manuelle Läufe überstehen Verbindungsabbrüche, weil der Server
 * das Ergebnis speichert und der Hook es per Polling abholt.
 */
export function useUseCaseDiscovery(analysis?: AnalysisResult | null, options: UseUseCaseDiscoveryOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UseCaseDiscoveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [briefingPending, setBriefingPending] = useState(false);
  const [pollKick, setPollKick] = useState(0);

  const { onComplete, onError } = options;
  const abortRef = useRef<AbortController | null>(null);
  const analysisId = analysis?.id;
  const knownGeneratedAt = useRef<string | undefined>(analysis?.useCaseDiscovery?.generatedAt);

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

  // Bei Analysewechsel: Zustand zurücksetzen und bekannten Stand übernehmen.
  const initialGeneratedAt = analysis?.useCaseDiscovery?.generatedAt;
  useEffect(() => {
    knownGeneratedAt.current = initialGeneratedAt;
    setResult(null);
    setError(null);
    setAutoRunning(false);
    setBriefingPending(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur beim Wechsel der Analyse
  }, [analysisId]);

  // Status-Polling für gespeicherte Analysen.
  useEffect(() => {
    if (analysisId == null) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const tick = async () => {
      let next = IDLE_POLL_MS;
      if (typeof document !== 'undefined' && document.hidden) {
        timer = setTimeout(tick, ACTIVE_POLL_MS);
        return;
      }
      try {
        const s = await apiRequest<UseCaseStatusResponse>(`/api/analyses/${analysisId}/use-cases/status`, {
          signal: controller.signal,
        });
        failures = 0;
        const running = s.status === 'running';
        setAutoRunning(running);
        setBriefingPending(!!s.briefingPending);
        if (s.status === 'done' && s.result && s.result.generatedAt !== knownGeneratedAt.current) {
          knownGeneratedAt.current = s.result.generatedAt;
          setResult(s.result);
          setError(null);
          onComplete?.(s.result);
        }
        const awaitingBriefing = !!s.briefingPending && !includesBriefing(s.result);
        if (running || awaitingBriefing) next = ACTIVE_POLL_MS;
      } catch (err) {
        if (isAbortError(err)) return;
        failures += 1;
        next = Math.min(MAX_BACKOFF_MS, ACTIVE_POLL_MS * 2 ** failures);
      }
      timer = setTimeout(tick, next);
    };
    timer = setTimeout(tick, 800);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [analysisId, pollKick, onComplete]);

  const discover = useCallback(
    async (target: AnalysisResult) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const data = await apiRequest<DiscoveryResponse>('/api/use-case-discovery', {
          method: 'POST',
          body: target,
          signal: controller.signal,
        });

        if (!data.ok || !data.result) {
          throw new Error('Invalid response from server');
        }

        if (abortRef.current !== controller) return;
        knownGeneratedAt.current = data.result.generatedAt;
        setResult(data.result);
        onComplete?.(data.result);
        return data.result;
      } catch (e) {
        if (isAbortError(e) || abortRef.current !== controller) return;
        if (target.id != null && isConnectionError(e)) {
          // Der Lauf geht serverseitig weiter und wird gespeichert – Ergebnis per Polling abholen.
          setAutoRunning(true);
          setPollKick((k) => k + 1);
          return;
        }
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
    setAutoRunning(false);
    setBriefingPending(false);
  }, []);

  return { discover, loading, result, error, reset, autoRunning, briefingPending };
}

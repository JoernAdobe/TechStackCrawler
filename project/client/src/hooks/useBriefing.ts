import { useCallback, useEffect, useState } from 'react';
import {
  RECONNECTING_MESSAGE,
  apiRequest,
  isAbortError,
  isConnectionError,
  toErrorMessage,
  withReconnect,
  type RequestOptions,
} from '../lib/apiClient';
import type {
  BriefingJob,
  BriefingJobStatus,
  BriefingResult,
  BriefingSectionId,
  BriefingStateResponse,
} from '../types/briefing';

const POLL_MS = 3000;
const MAX_BACKOFF_MS = 30_000;
const ACTIVE: ReadonlySet<BriefingJobStatus> = new Set(['queued', 'running']);

export const isBriefingActive = (job: BriefingJob | null | undefined) => !!job && ACTIVE.has(job.status);

/** Dev-only: `?mockBriefing=<mode>` beantwortet alle Briefing-Calls aus der Fixture. */
export function isBriefingMock(): boolean {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).has('mockBriefing');
}

function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  // In Prod ist import.meta.env.DEV false → Zweig samt dynamischem Import fällt beim Build weg.
  if (import.meta.env.DEV && isBriefingMock()) {
    return import('../components/briefing/__fixtures__/mockBriefingApi').then((m) =>
      m.mockBriefingRequest<T>(path, options.method ?? 'GET', options.body),
    );
  }
  return apiRequest<T>(path, options);
}

export function briefingReportUrl(jobId: number, download = false): string {
  return `/api/briefings/${jobId}/report.html${download ? '?download=1' : ''}`;
}

export function briefingPdfUrl(jobId: number): string {
  return `/api/briefings/${jobId}/report.pdf`;
}

interface UseBriefingOptions {
  /** Abschnitte, mit denen beim Mount sofort ein Job gestartet wird (Checkbox im Analyzer). */
  autoStartSections?: BriefingSectionId[] | null;
  onAutoStartConsumed?: () => void;
}

/**
 * Lädt/startet das Client Pre-Briefing einer Analyse und pollt laufende Jobs.
 * Die aufrufende Komponente sollte per `key={analysisId}` neu gemountet werden.
 */
export function useBriefing(analysisId: number | undefined, options: UseBriefingOptions = {}) {
  const [initialAutoStart] = useState(() => options.autoStartSections ?? null);
  const [onConsumed] = useState(() => options.onAutoStartConsumed);
  const [job, setJob] = useState<BriefingJob | null>(null);
  const [result, setResult] = useState<BriefingResult | null>(null);
  const [loading, setLoading] = useState(analysisId != null);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = useCallback((state: BriefingStateResponse) => {
    setJob(state.job);
    setResult(state.result);
  }, []);

  // Initial: vorhandenes Briefing laden oder (Checkbox) direkt starten.
  useEffect(() => {
    if (analysisId == null) return;
    const controller = new AbortController();
    // Bei Verbindungsabbruch (z. B. Server-Neustart) automatisch neu verbinden – der POST ist
    // idempotent (liefert den offenen Job zurück), das Briefing läuft serverseitig weiter.
    const reconnect = { signal: controller.signal, onRetry: () => setPollError(RECONNECTING_MESSAGE) };
    const run = initialAutoStart
      ? withReconnect(() => request<BriefingJob>(`/api/analyses/${analysisId}/briefing`, {
        method: 'POST', body: { sections: initialAutoStart }, signal: controller.signal,
      }), reconnect).then((started) => {
        onConsumed?.();
        apply({ job: started, result: null });
      })
      : withReconnect(
        () => request<BriefingStateResponse>(`/api/analyses/${analysisId}/briefing`, { signal: controller.signal }),
        reconnect,
      ).then(apply);
    run
      .then(() => {
        setError(null);
        setPollError(null);
      })
      .catch((err: unknown) => {
        if (!isAbortError(err)) setError(toErrorMessage(err, 'Could not load the Client Pre-Briefing.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [analysisId, initialAutoStart, onConsumed, apply]);

  const jobId = job?.id;
  const active = isBriefingActive(job);

  // Polling, solange der Job läuft; Backoff bei Fehlern, Stopp bei Unmount/Ende.
  useEffect(() => {
    if (jobId == null || !active) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const tick = async () => {
      try {
        const state = await request<BriefingStateResponse>(`/api/briefings/${jobId}`, { signal: controller.signal });
        failures = 0;
        setPollError(null);
        apply(state);
        if (state.job && !ACTIVE.has(state.job.status)) return;
      } catch (err) {
        if (isAbortError(err)) return;
        failures += 1;
        setPollError(isConnectionError(err) ? RECONNECTING_MESSAGE : toErrorMessage(err, 'Connection problem – retrying…'));
      }
      timer = setTimeout(tick, failures ? Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** failures) : POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [jobId, active, apply]);

  const start = useCallback(
    async (sections: BriefingSectionId[]) => {
      if (analysisId == null) return;
      setBusy(true);
      setError(null);
      try {
        const started = await withReconnect(
          () => request<BriefingJob>(`/api/analyses/${analysisId}/briefing`, { method: 'POST', body: { sections } }),
          { onRetry: () => setPollError(RECONNECTING_MESSAGE) },
        );
        setPollError(null);
        apply({ job: started, result: null });
      } catch (err) {
        setError(toErrorMessage(err, 'Could not start the Client Pre-Briefing.'));
      } finally {
        setBusy(false);
      }
    },
    [analysisId, apply],
  );

  const cancel = useCallback(async () => {
    if (jobId == null) return;
    setBusy(true);
    try {
      setJob(await request<BriefingJob>(`/api/briefings/${jobId}/cancel`, { method: 'POST' }));
    } catch (err) {
      setError(toErrorMessage(err, 'Could not cancel the briefing.'));
    } finally {
      setBusy(false);
    }
  }, [jobId]);

  return { job, result, loading, error, pollError, busy, active, start, cancel };
}

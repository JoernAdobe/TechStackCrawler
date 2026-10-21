import { useCallback, useEffect, useState } from 'react';
import { apiRequest, isAbortError, toErrorMessage } from '../lib/apiClient';
import type { LibraryResponse } from '../types/library';

/** Lädt GET /api/library; `refreshTrigger` erzwingt ein Neuladen (z. B. nach neuer Analyse). */
export function useLibrary(refreshTrigger = 0) {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- gewollter Data-Fetch bei Mount/Refresh
    setLoading(true);
    setError('');
    apiRequest<LibraryResponse>('/api/library', {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-store' },
    })
      .then((res) => {
        if (!controller.signal.aborted) setData(res);
      })
      .catch((e: unknown) => {
        if (!isAbortError(e) && !controller.signal.aborted) setError(toErrorMessage(e, 'Failed to load the library.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refreshTrigger, reloadKey]);

  return { data, loading, error, reload };
}

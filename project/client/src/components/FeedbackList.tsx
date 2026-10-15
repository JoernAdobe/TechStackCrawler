import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiErrorFromResponse, apiRequest, isAbortError, toErrorMessage, toNetworkError } from '../lib/apiClient';
import type { FeedbackEntry } from '../types/parity';

type Status = NonNullable<FeedbackEntry['status']>;
const STATUSES: Status[] = ['open', 'triaged', 'done'];

interface FeedbackListProps {
  token: string;
}

function ratingIcon(r?: -1 | 0 | 1): string {
  if (r === 1) return '👍';
  if (r === -1) return '👎';
  return '—';
}

/** PATCH ist im zentralen apiRequest nicht vorgesehen – daher hier ein schlanker fetch mit gleichem Fehlerformat. */
async function patchStatus(id: number, status: Status, token: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/feedback/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
  } catch (err) {
    throw toNetworkError(err);
  }
  if (!res.ok) throw await apiErrorFromResponse(res);
}

export default function FeedbackList({ token }: FeedbackListProps) {
  const [items, setItems] = useState<FeedbackEntry[]>([]);
  const [filter, setFilter] = useState<Status | ''>('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const qs = filter ? `?status=${filter}` : '';
      setItems(await apiRequest<FeedbackEntry[]>(`/api/feedback${qs}`, { token, signal: controller.signal }));
    } catch (err) {
      if (isAbortError(err)) return;
      setError(toErrorMessage(err, 'Failed to load feedback'));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }, [token, filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(id: number, status: Status) {
    setUpdating(id);
    setError('');
    try {
      await patchStatus(id, status, token);
      setItems((prev) =>
        prev
          .map((f) => (f.id === id ? { ...f, status } : f))
          .filter((f) => !filter || f.status === filter),
      );
    } catch (err) {
      setError(toErrorMessage(err, 'Failed to update status'));
    } finally {
      setUpdating(null);
    }
  }

  return (
    <section className="rounded-xl border border-ts-border bg-ts-surface-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold text-ts-text-secondary uppercase tracking-wider">User Feedback</h3>
        <div className="flex items-center gap-2">
          <label htmlFor="fb-filter" className="text-xs text-ts-text-secondary">Status</label>
          <select
            id="fb-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Status | '')}
            className="px-2 py-1.5 rounded-lg border border-ts-border bg-ts-surface text-ts-text-primary text-xs focus:outline-none focus:ring-2 focus:ring-adobe-red/40"
          >
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            type="button"
            onClick={load}
            aria-label="Refresh feedback"
            className="p-1.5 rounded-lg border border-ts-border bg-ts-surface-light text-ts-text-secondary hover:text-ts-text-primary transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <p role="alert" className="text-adobe-red text-xs mb-3 whitespace-pre-line">{error}</p>}

      {loading && items.length === 0 ? (
        <p className="text-ts-text-secondary text-sm py-4 text-center">Loading feedback…</p>
      ) : items.length === 0 ? (
        <p className="text-ts-text-secondary text-sm py-4 text-center">No feedback {filter ? `with status "${filter}"` : 'yet'}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ts-text-secondary uppercase tracking-wider border-b border-ts-border">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Rating</th>
                <th className="py-2 pr-3 font-medium">Feedback</th>
                <th className="py-2 pr-3 font-medium">Context</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.id} className="border-b border-ts-border/50 align-top">
                  <td className="py-2 pr-3 text-xs text-ts-text-secondary whitespace-nowrap">
                    {f.createdAt ? new Date(f.createdAt).toLocaleString() : '—'}
                    {f.createdBy && <div className="truncate max-w-[10rem]">{f.createdBy}</div>}
                  </td>
                  <td className="py-2 pr-3 text-xs text-ts-text-primary whitespace-nowrap">{f.type}</td>
                  <td className="py-2 pr-3 text-center">{ratingIcon(f.rating)}</td>
                  <td className="py-2 pr-3 text-ts-text-primary max-w-md">
                    {f.title && <div className="font-semibold">{f.title}</div>}
                    <div className="text-xs text-ts-text-secondary whitespace-pre-line break-words">{f.description}</div>
                    {f.missingSolutions?.length ? (
                      <ul className="mt-1 text-xs text-ts-text-secondary list-disc pl-4">
                        {f.missingSolutions.map((m, i) => (
                          <li key={i}>
                            <span className="text-ts-text-primary">{m.solution}</span>
                            {m.category && ` (${m.category})`}
                            {m.url && <span className="break-all"> – {m.url}</span>}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-xs text-ts-text-secondary whitespace-nowrap">
                    {f.analysisId && <div>Analysis #{f.analysisId}</div>}
                    {f.batchId && <div>Batch #{f.batchId}</div>}
                    {!f.analysisId && !f.batchId && '—'}
                  </td>
                  <td className="py-2">
                    <select
                      aria-label={`Status of feedback ${f.id}`}
                      value={f.status ?? 'open'}
                      disabled={updating === f.id || f.id === undefined}
                      onChange={(e) => f.id !== undefined && changeStatus(f.id, e.target.value as Status)}
                      className="px-2 py-1 rounded-lg border border-ts-border bg-ts-surface text-ts-text-primary text-xs focus:outline-none focus:ring-2 focus:ring-adobe-red/40 disabled:opacity-50"
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

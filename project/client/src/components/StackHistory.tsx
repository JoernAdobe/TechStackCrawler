import { useEffect, useState } from 'react';
import { History, Plus, Minus } from 'lucide-react';
import type { StackHistoryResult } from '../types/parity';
import { apiRequest, isAbortError } from '../lib/apiClient';

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function StackHistory({ url }: { url: string }) {
  const [history, setHistory] = useState<StackHistoryResult | null>(null);

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    apiRequest<StackHistoryResult>(`/api/stack-history?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      .then((data) => setHistory(data))
      .catch((e: unknown) => {
        if (!isAbortError(e)) setHistory(null);
      });
    return () => controller.abort();
  }, [url]);

  if (!history || history.entries.length < 2) return null;
  const { delta } = history;
  const entries = [...history.entries].reverse();

  return (
    <section className="p-5 rounded-2xl border border-ts-border bg-ts-surface-card space-y-4">
      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-ts-accent" />
        <h3 className="text-sm font-semibold text-ts-text-primary">Stack History · {history.hostname}</h3>
        <span className="text-xs text-ts-text-secondary">{history.entries.length} analyses</span>
      </div>

      {delta && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-ts-success mb-2 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Added since previous analysis ({delta.added.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {delta.added.length === 0 && <span className="text-xs text-ts-text-secondary">—</span>}
              {delta.added.map((t) => (
                <span key={t} className="px-2 py-0.5 text-xs rounded-md border border-ts-success/40 bg-ts-success/10 text-ts-success">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-adobe-red mb-2 flex items-center gap-1">
              <Minus className="w-3.5 h-3.5" /> Removed since previous analysis ({delta.removed.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {delta.removed.length === 0 && <span className="text-xs text-ts-text-secondary">—</span>}
              {delta.removed.map((t) => (
                <span key={t} className="px-2 py-0.5 text-xs rounded-md border border-adobe-red/40 bg-adobe-red/10 text-adobe-red line-through">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <ol className="relative border-l border-ts-border ml-1.5 space-y-3">
        {entries.map((e, i) => (
          <li key={e.analysisId} className="ml-4">
            <span
              className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ${i === 0 ? 'bg-adobe-red' : 'bg-ts-border'}`}
              aria-hidden="true"
            />
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-ts-text-primary">{formatDate(e.analyzedAt)}</span>
              <span className="text-xs text-ts-text-secondary">
                #{e.analysisId} · {e.technologies.length} technologies
              </span>
            </div>
            <p className="text-xs text-ts-text-secondary mt-0.5 line-clamp-2">{e.technologies.join(', ')}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

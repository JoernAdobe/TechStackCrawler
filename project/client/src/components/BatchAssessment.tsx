import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Building2, Layers, RefreshCw } from 'lucide-react';
import type { BatchJob, BatchKind } from '../types/parity';
import { apiRequest, isAbortError, toErrorMessage } from '../lib/apiClient';
import BatchForm from './BatchForm';
import BatchDetail, { StatusPill } from './BatchDetail';

export interface BatchAssessmentProps {
  /** Zusätzliche Aktionen im Detail-Header (z. B. Deck-Export). */
  renderExtraActions?: (batch: BatchJob) => ReactNode;
  /** Optional: öffnet eine Einzelanalyse (App unterstützt aktuell kein Deep-Link-Routing). */
  onOpenAnalysis?: (analysisId: number) => void;
}

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function BatchAssessment({ renderExtraActions, onOpenAnalysis }: BatchAssessmentProps) {
  const [mode, setMode] = useState<BatchKind>('account');
  const [batches, setBatches] = useState<BatchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<BatchJob[]>('/api/batches', { signal: controller.signal })
      .then((data) => {
        setBatches(data);
        setError('');
      })
      .catch((e: unknown) => {
        if (!isAbortError(e)) setError(toErrorMessage(e, 'Failed to load assessments.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const hasActive = batches.some((b) => b.status === 'queued' || b.status === 'running');
  useEffect(() => {
    if (!hasActive || selectedId !== null) return;
    const t = setTimeout(reload, 5000);
    return () => clearTimeout(t);
  }, [hasActive, selectedId, batches, reload]);

  if (selectedId !== null) {
    return (
      <div className="space-y-4">
        {warnings.length > 0 && (
          <div className="p-3 rounded-lg border border-ts-warning/40 bg-ts-warning/10 text-xs text-ts-warning space-y-0.5">
            <p className="font-semibold">{warnings.length} input line(s) were skipped:</p>
            {warnings.slice(0, 10).map((w, i) => <p key={i}>{w}</p>)}
            {warnings.length > 10 && <p>…and {warnings.length - 10} more</p>}
          </div>
        )}
        <BatchDetail
          batchId={selectedId}
          onBack={() => {
            setSelectedId(null);
            setWarnings([]);
            reload();
          }}
          onChanged={reload}
          onOpenAnalysis={onOpenAnalysis}
          renderExtraActions={renderExtraActions}
        />
      </div>
    );
  }

  const tabBtn = (kind: BatchKind, label: string, Icon: typeof Building2) => (
    <button
      type="button"
      onClick={() => setMode(kind)}
      aria-pressed={mode === kind}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
        mode === kind
          ? 'bg-ts-surface-card text-ts-text-primary border border-ts-border'
          : 'text-ts-text-secondary hover:text-ts-text-primary border border-transparent'
      }`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex gap-2 mb-3">
          {tabBtn('account', 'Account Assessment', Building2)}
          {tabBtn('bulk', 'Bulk Assessment', Layers)}
        </div>
        <p className="text-xs text-ts-text-secondary mb-3">
          {mode === 'account'
            ? 'Assess up to 30 web properties of one account through a lens (brand, geo, journey stage, competitors) and get a solution mapping with key findings.'
            : 'Assess up to 1,000 URLs from a list or CSV. Large batches require admin approval; detection-only mode avoids LLM cost.'}
        </p>
        <BatchForm
          key={mode}
          mode={mode}
          onCreated={(batch, w) => {
            setWarnings(w);
            setSelectedId(batch.id);
            reload();
          }}
        />
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-ts-text-primary">Past Assessments</h3>
          <button onClick={reload} className="flex items-center gap-1.5 text-xs text-ts-accent hover:text-ts-accent-light">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-ts-text-secondary">Loading assessments…</p>
        ) : error ? (
          <p role="alert" className="text-sm text-adobe-red">{error}</p>
        ) : batches.length === 0 ? (
          <p className="text-sm text-ts-text-secondary">No assessments yet.</p>
        ) : (
          <div className="rounded-xl border border-ts-border divide-y divide-ts-border/60 bg-ts-surface-card">
            {batches.map((b) => {
              const processed = b.done + b.failed;
              const pct = b.total > 0 ? Math.round((processed / b.total) * 100) : 0;
              return (
                <button
                  key={b.id}
                  onClick={() => setSelectedId(b.id)}
                  className="w-full text-left px-4 py-3 hover:bg-ts-surface-light transition-colors flex flex-col md:flex-row md:items-center gap-2 md:gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ts-text-primary truncate">{b.title}</span>
                      <StatusPill status={b.status} />
                    </div>
                    <p className="text-xs text-ts-text-secondary mt-0.5">
                      {b.kind === 'account' ? 'Account' : 'Bulk'}
                      {b.accountName && ` · ${b.accountName}`}
                      {b.lens && ` · ${b.lens}`} · {formatDate(b.createdAt)}
                    </p>
                  </div>
                  <div className="md:w-48 shrink-0">
                    <div className="flex justify-between text-xs text-ts-text-secondary mb-1">
                      <span>{processed}/{b.total}</span>
                      {b.failed > 0 && <span className="text-adobe-red">{b.failed} failed</span>}
                    </div>
                    <div className="h-1.5 rounded-full bg-ts-surface-light overflow-hidden">
                      <div className={`h-full ${b.status === 'completed' ? 'bg-ts-success' : 'bg-adobe-red'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Ban, Check, FileArchive, FileDown, FileSpreadsheet, FileText, X } from 'lucide-react';
import type { BatchJob, BatchStatus } from '../types/parity';
import { apiRequest, isAbortError, toErrorMessage } from '../lib/apiClient';
import { downloadBatchXlsx } from '../lib/batchExcel';
import SolutionMatrix from './SolutionMatrix';
import AccountDashboard from './AccountDashboard';
import { BriefingScoreCell, BriefingSortHeader } from './BatchBriefingScore';
import {
  batchHasBriefings,
  isBriefingOpen,
  nextBriefingSort,
  sortByBriefingScore,
  type BriefingSort,
} from '../lib/batchBriefing';

const POLL_MS = 3000;

const STATUS_STYLES: Record<BatchStatus | 'done' | 'skipped', string> = {
  pending_approval: 'text-ts-warning border-ts-warning/40 bg-ts-warning/10',
  queued: 'text-ts-text-secondary border-ts-border bg-ts-surface-light',
  running: 'text-sky-300 border-sky-400/40 bg-sky-400/10',
  completed: 'text-ts-success border-ts-success/40 bg-ts-success/10',
  done: 'text-ts-success border-ts-success/40 bg-ts-success/10',
  failed: 'text-adobe-red border-adobe-red/40 bg-adobe-red/10',
  cancelled: 'text-ts-text-secondary border-ts-border bg-ts-surface-light',
  rejected: 'text-adobe-red border-adobe-red/40 bg-adobe-red/10',
  skipped: 'text-ts-text-secondary border-ts-border bg-ts-surface-light',
};

export function StatusPill({ status }: { status: string }) {
  const cls = STATUS_STYLES[status as BatchStatus] ?? STATUS_STYLES.queued;
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded-full border whitespace-nowrap ${cls}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

const SOURCE_NAMES: Record<string, string> = {
  traffic: 'Tranco',
  semrush: 'Semrush',
  observepoint: 'ObservePoint',
  mobileApps: 'Apps',
  lighthouse: 'Lighthouse',
  geo: 'GEO',
  useCases: 'Use cases',
  multiPage: 'Subpages',
  briefing: 'Pre-Briefing',
};

function enrichmentSummary(batch: BatchJob): string {
  const o = batch.enrichmentOptions;
  if (!o) return '';
  const on = Object.entries(SOURCE_NAMES)
    .filter(([k]) => o[k as keyof typeof o] === true)
    .map(([, v]) => v);
  return on.length ? ` · Sources: ${on.join(', ')}` : '';
}

/** Kurzer Status der Enrichments eines Items (Tooltip mit Fehlern/Skips). */
function itemSources(it: NonNullable<BatchJob['items']>[number]): { text: string; title: string } {
  const e = it.enrichments;
  if (!e) return { text: '', title: '' };
  const parts: string[] = [];
  if (e.traffic?.trancoRank) parts.push(`#${e.traffic.trancoRank.toLocaleString('en-US')}`);
  if (e.lighthouse?.mobilePerformance !== undefined && e.lighthouse.mobilePerformance !== null) parts.push(`LH ${e.lighthouse.mobilePerformance}`);
  if (e.geo) parts.push(`GEO ${e.geo.geoScore}`);
  if (e.observepoint?.status === 'done' && e.observepoint.agreementRate !== null) parts.push(`OP ${Math.round(e.observepoint.agreementRate)}%`);
  if (e.mobileApps?.count) parts.push(`${e.mobileApps.count} apps`);
  const issues = [...Object.values(e.errors ?? {}), ...Object.entries(e.skipped ?? {}).map(([k, v]) => `${k}: ${v}`)];
  if (issues.length) parts.push(`⚠ ${issues.length}`);
  return { text: parts.join(' · '), title: issues.join('\n') };
}

export interface BatchDetailProps {
  batchId: number;
  onBack: () => void;
  onChanged?: () => void;
  onOpenAnalysis?: (analysisId: number) => void;
  renderExtraActions?: (batch: BatchJob) => ReactNode;
}

export default function BatchDetail({ batchId, onBack, onChanged, onOpenAnalysis, renderExtraActions }: BatchDetailProps) {
  const [batch, setBatch] = useState<BatchJob | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [tick, setTick] = useState(0);
  const [briefingSort, setBriefingSort] = useState<BriefingSort>('none');

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<BatchJob>(`/api/batches/${batchId}`, { signal: controller.signal })
      .then((b) => {
        setBatch(b);
        setError('');
      })
      .catch((e: unknown) => {
        if (!isAbortError(e)) setError(toErrorMessage(e, 'Failed to load assessment.'));
      });
    return () => controller.abort();
  }, [batchId, tick]);

  const briefingsOpen = (batch?.items ?? []).some((it) => isBriefingOpen(it.enrichments?.briefing));
  const active = batch?.status === 'queued' || batch?.status === 'running' || briefingsOpen;
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setTick((n) => n + 1), POLL_MS);
    return () => clearTimeout(t);
  }, [active, batch]);

  const runAction = useCallback(
    async (action: 'cancel' | 'approve' | 'reject') => {
      setActionError('');
      try {
        await apiRequest(`/api/batches/${batchId}/${action}`, { method: 'POST' });
        setTick((n) => n + 1);
        onChanged?.();
      } catch (e) {
        setActionError(toErrorMessage(e, `Failed to ${action} the assessment.`));
      }
    },
    [batchId, onChanged],
  );

  if (error && !batch) {
    return <p role="alert" className="text-sm text-adobe-red">{error}</p>;
  }
  if (!batch) {
    return <p className="text-sm text-ts-text-secondary">Loading assessment…</p>;
  }

  const showBriefing = batchHasBriefings(batch);
  const briefingsDone = (batch.items ?? []).filter((it) => it.enrichments?.briefing?.status === 'done').length;
  const items = sortByBriefingScore((batch.items ?? []).map((it, i) => ({ ...it, rowNo: i + 1 })), briefingSort);
  const processed = batch.done + batch.failed;
  const pct = batch.total > 0 ? Math.round((processed / batch.total) * 100) : 0;
  const btn =
    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-ts-border text-ts-text-secondary hover:text-ts-text-primary hover:border-ts-accent/40 transition-colors';

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-ts-accent hover:text-ts-accent-light">
        <ArrowLeft className="w-4 h-4" /> Back to assessments
      </button>

      <div className="p-5 rounded-2xl border border-ts-border bg-ts-surface-card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-ts-text-primary">{batch.title}</h2>
              <StatusPill status={batch.status} />
            </div>
            <p className="text-xs text-ts-text-secondary mt-1">
              {batch.kind === 'account' ? 'Account Assessment' : 'Bulk Assessment'}
              {batch.accountName && ` · ${batch.accountName}`}
              {batch.industry && ` · ${batch.industry}`}
              {batch.opportunityId && ` · Opp ${batch.opportunityId}`}
              {batch.lens && ` · Lens: ${batch.lens}`}
              {` · ${batch.aiAnalysis ? 'Full AI analysis' : 'Detection only'}`}
              {enrichmentSummary(batch)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(batch.status === 'queued' || batch.status === 'running' || batch.status === 'pending_approval') && (
              <button className={btn} onClick={() => void runAction('cancel')}>
                <Ban className="w-3.5 h-3.5" /> Cancel
              </button>
            )}
            {batch.status === 'pending_approval' && (
              <>
                <button className={btn} onClick={() => void runAction('approve')}>
                  <Check className="w-3.5 h-3.5" /> Approve
                </button>
                <button className={btn} onClick={() => void runAction('reject')}>
                  <X className="w-3.5 h-3.5" /> Reject
                </button>
              </>
            )}
            <a className={btn} href={`/api/batches/${batch.id}/export.csv`} download>
              <FileDown className="w-3.5 h-3.5" /> CSV
            </a>
            <button className={btn} onClick={() => downloadBatchXlsx(batch)} disabled={!batch.items?.length}>
              <FileSpreadsheet className="w-3.5 h-3.5" /> XLSX
            </button>
            <a className={btn} href={`/api/batches/${batch.id}/export.md`} download>
              <FileText className="w-3.5 h-3.5" /> Markdown
            </a>
            {briefingsDone > 0 && (
              <a className={btn} href={`/api/batches/${batch.id}/briefings.zip`} download>
                <FileArchive className="w-3.5 h-3.5" /> Download briefings (ZIP)
              </a>
            )}
            {renderExtraActions?.(batch)}
          </div>
        </div>

        {batch.status === 'pending_approval' && (
          <p className="text-xs text-ts-warning">
            This bulk assessment exceeds the approval threshold and waits for an admin (dashboard login) to approve it.
          </p>
        )}
        {actionError && <p role="alert" className="text-xs text-adobe-red whitespace-pre-line">{actionError}</p>}

        <div>
          <div className="flex justify-between text-xs text-ts-text-secondary mb-1">
            <span>
              {processed}/{batch.total} processed · {batch.done} done · {batch.failed} failed
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-ts-surface-light overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-gradient-to-r from-adobe-red to-adobe-red-dark transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {batch.accountView && <AccountDashboard view={batch.accountView} onOpenAnalysis={onOpenAnalysis} />}

      {batch.matrix && <SolutionMatrix matrix={batch.matrix} />}

      <section>
        <h3 className="text-sm font-semibold text-ts-text-primary mb-3">URLs</h3>
        <div className="overflow-x-auto rounded-xl border border-ts-border">
          <table className="min-w-full text-xs">
            <thead className="bg-ts-surface-light text-ts-text-secondary">
              <tr>
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">URL</th>
                <th className="text-left px-3 py-2">Label</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Analysis</th>
                {showBriefing && <BriefingSortHeader sort={briefingSort} onSort={() => setBriefingSort(nextBriefingSort)} />}
                <th className="text-left px-3 py-2">Technologies</th>
                <th className="text-left px-3 py-2">Sources</th>
                <th className="text-left px-3 py-2">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ts-border/60 bg-ts-surface-card">
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2 text-ts-text-secondary">{it.rowNo}</td>
                  <td className="px-3 py-2 text-ts-text-primary max-w-[22rem] truncate" title={it.url}>{it.url}</td>
                  <td className="px-3 py-2 text-ts-text-secondary">{it.label ?? ''}</td>
                  <td className="px-3 py-2"><StatusPill status={it.status} /></td>
                  <td className="px-3 py-2">
                    {it.analysisId ? (
                      onOpenAnalysis ? (
                        <button className="text-ts-accent hover:text-ts-accent-light underline" onClick={() => onOpenAnalysis(it.analysisId!)}>
                          #{it.analysisId}
                        </button>
                      ) : (
                        <span className="text-ts-text-secondary">#{it.analysisId}</span>
                      )
                    ) : (
                      <span className="text-ts-text-secondary">—</span>
                    )}
                  </td>
                  {showBriefing && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      <BriefingScoreCell item={it} onOpenAnalysis={onOpenAnalysis} />
                    </td>
                  )}
                  <td className="px-3 py-2 text-ts-text-secondary">{it.detections ? it.detections.filter((d) => !d.weak).length : ''}</td>
                  <td className="px-3 py-2 text-ts-text-secondary whitespace-nowrap" title={itemSources(it).title}>{itemSources(it).text}</td>
                  <td className="px-3 py-2 text-adobe-red">{it.error ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

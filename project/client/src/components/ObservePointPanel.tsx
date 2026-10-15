import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info, Loader2, Play, RefreshCw, ScanSearch, Zap } from 'lucide-react';
import type { AnalysisResult } from '../types/analysis';
import type { EvidenceMatrix as EvidenceMatrixData, ObservePointResult } from '../types/parity';
import { apiRequest, isAbortError, toErrorMessage } from '../lib/apiClient';
import EvidenceMatrix from './EvidenceMatrix';
import ObservePointInsights from './ObservePointInsights';

interface ObservePointPanelProps {
  analysis: AnalysisResult;
  onUpdate: (a: AnalysisResult) => void;
}

interface ObservePointStatusInfo {
  configured: boolean;
  freshScans: boolean;
  autoFresh?: boolean;
  maxPages: number;
  maxRunAgeDays: number;
}

type Mode = 'reuse' | 'fresh';

function formatDate(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ObservePointPanel({ analysis, onUpdate }: ObservePointPanelProps) {
  const [status, setStatus] = useState<ObservePointStatusInfo | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loading, setLoading] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const latest = useRef(analysis);
  latest.current = analysis;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<ObservePointStatusInfo>('/api/observepoint/status', { signal: controller.signal })
      .then(setStatus)
      .catch((e: unknown) => {
        if (!isAbortError(e)) setStatusError(toErrorMessage(e));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const op = analysis.enrichments?.observepoint;
  const matrix = analysis.enrichments?.evidenceMatrix;

  // Der Server gleicht nach jeder Analyse automatisch ab (und startet bei Bedarf einen Fresh-Scan).
  // Solange noch kein Ergebnis da ist bzw. ein Scan läuft, hier still nachladen.
  const awaitingAuto = !op && Boolean(analysis.id) && Boolean(status?.configured);
  const pollActive = (awaitingAuto || op?.status === 'running') && loading === null;
  const opKey = op ? `${op.status}|${op.fetchedAt}` : 'none';
  useEffect(() => {
    if (!pollActive || !analysis.id) return;
    const id = analysis.id;
    const controller = new AbortController();
    const startedAt = Date.now();
    const timer = window.setInterval(async () => {
      // Ohne Auto-Ergebnis nach 5 Minuten aufgeben (z. B. Server neu gestartet) – der Button bleibt.
      if (awaitingAuto && Date.now() - startedAt > 5 * 60_000) return window.clearInterval(timer);
      try {
        const fresh = await apiRequest<AnalysisResult>(`/api/analyses/${id}`, { signal: controller.signal });
        const next = fresh.enrichments?.observepoint;
        if (!next || `${next.status}|${next.fetchedAt}` === opKey) return;
        const updated: AnalysisResult = {
          ...latest.current,
          enrichments: { ...latest.current.enrichments, observepoint: next, evidenceMatrix: fresh.enrichments?.evidenceMatrix },
        };
        latest.current = updated;
        onUpdateRef.current(updated);
        if (next.status === 'done') setAnnouncement('ObservePoint results arrived and the evidence matrix was updated.');
      } catch {
        // Polling ist best effort; nächster Tick versucht es erneut.
      }
    }, awaitingAuto ? 8_000 : 20_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [pollActive, awaitingAuto, analysis.id, opKey]);

  const run = async (mode: Mode) => {
    if (!analysis.id) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(mode);
    setError(null);
    setAnnouncement(mode === 'fresh' ? 'Starting a fresh ObservePoint scan…' : 'Comparing with ObservePoint…');
    try {
      const data = await apiRequest<{ observepoint: ObservePointResult; evidenceMatrix: EvidenceMatrixData }>(
        `/api/analyses/${analysis.id}/enrich/observepoint`,
        { method: 'POST', body: { mode }, signal: controller.signal },
      );
      const updated: AnalysisResult = {
        ...latest.current,
        enrichments: {
          ...latest.current.enrichments,
          observepoint: data.observepoint,
          evidenceMatrix: data.evidenceMatrix,
        },
      };
      latest.current = updated;
      onUpdate(updated);
      setAnnouncement(`ObservePoint comparison updated (${new Date().toLocaleTimeString('en-US', { timeStyle: 'short' })}).`);
    } catch (e: unknown) {
      if (!isAbortError(e)) {
        setError(toErrorMessage(e, 'ObservePoint comparison failed.'));
        setAnnouncement('');
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(null);
      }
    }
  };

  const configured = status?.configured ?? false;
  const busy = loading !== null;
  const notConfigured = status !== null && !status.configured;
  const opAvailable = matrix?.sources.some((s) => s.id === 'observepoint' && s.available) ?? false;

  return (
    <section id="section-observepoint" aria-busy={busy}>
      <div className="bg-ts-surface-card rounded-2xl border border-ts-border overflow-hidden">
        <div className="bg-gradient-to-br from-ts-accent/10 via-ts-surface-card to-adobe-red/5 p-4 sm:p-6 border-b border-ts-border flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-ts-text-primary flex items-center gap-2">
              <ScanSearch className="w-6 h-6 text-ts-accent shrink-0" strokeWidth={1.5} aria-hidden="true" />
              ObservePoint · Evidence Matrix
            </h2>
            <p className="mt-1 text-sm text-ts-text-secondary max-w-2xl">
              Second, independent detection source: ObservePoint audits (real tag requests across multiple pages) are
              compared with the TechStack detection – per technology and per building block.
            </p>
          </div>
          {analysis.id && configured && (
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => void run('reuse')}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-adobe-red to-adobe-red-dark text-white text-sm font-medium rounded-xl hover:opacity-90 transition-all duration-200 disabled:opacity-60"
              >
                {loading === 'reuse' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : op ? (
                  <RefreshCw className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {loading === 'reuse' ? 'Comparing…' : op ? 'Re-run comparison' : 'Compare with ObservePoint'}
              </button>
              {status?.freshScans && (
                <button
                  type="button"
                  onClick={() => void run('fresh')}
                  disabled={busy}
                  title={`Consumes page quota of the shared ObservePoint account (max. ${status.maxPages} pages).`}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-ts-border text-ts-text-secondary hover:text-ts-text-primary hover:border-ts-accent transition-colors disabled:opacity-50"
                >
                  {loading === 'fresh' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Start fresh OP scan
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 space-y-5">
          {!analysis.id && (
            <p className="text-sm text-ts-text-secondary">
              The ObservePoint comparison is only available for saved analyses (database required).
            </p>
          )}

          {analysis.id && notConfigured && (
            <p className="text-sm text-ts-text-secondary flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.5} />
              ObservePoint is not configured (OBSERVEPOINT_API_KEY missing) – the comparison is disabled.
            </p>
          )}

          {statusError && !status && (
            <p className="text-xs text-ts-text-secondary">ObservePoint status unavailable: {statusError}</p>
          )}

          {awaitingAuto && !busy && (
            <p className="text-sm text-ts-text-secondary flex items-start gap-2 rounded-xl border border-ts-border bg-ts-surface-light/30 px-4 py-3">
              <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin" />
              Checking ObservePoint automatically – results appear here as soon as they are available.
            </p>
          )}

          {analysis.id && status && configured && (
            <p className="text-xs text-ts-text-secondary">
              Uses existing audits from the shared account (runs no older than {status.maxRunAgeDays} days).
              {status.autoFresh
                ? ` If no audit exists, a fresh scan (max. ${status.maxPages} pages) starts automatically in the background.`
                : status.freshScans &&
                  ` A fresh scan consumes page quota of the shared account (max. ${status.maxPages} pages).`}
            </p>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-adobe-red/30 bg-adobe-red/10 px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-adobe-red shrink-0 mt-0.5" strokeWidth={1.5} />
              <p className="text-xs text-ts-text-primary break-words">{error}</p>
            </div>
          )}

          {op?.status === 'running' && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ts-warning/30 bg-ts-warning/10 px-4 py-3">
              <p className="text-sm text-ts-text-secondary flex items-start gap-2">
                <Loader2 className="w-4 h-4 text-ts-warning shrink-0 mt-0.5 animate-spin" />
                {op.note ?? 'The ObservePoint scan is still running.'}
              </p>
              <button
                type="button"
                onClick={() => void run('reuse')}
                disabled={busy || !configured}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-ts-border text-ts-text-secondary hover:text-ts-text-primary hover:border-ts-accent transition-colors disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Check again
              </button>
            </div>
          )}

          {op?.status === 'not_found' && (
            <p className="text-sm text-ts-text-secondary flex items-start gap-2 rounded-xl border border-ts-border bg-ts-surface-light/30 px-4 py-3">
              <Info className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.5} />
              {op.note ?? 'No matching ObservePoint audit was found for this domain.'}
            </p>
          )}

          {op && op.status === 'done' && (
            <p className="text-xs text-ts-text-secondary break-words">
              Source: ObservePoint audit {op.auditId != null ? `#${op.auditId}` : ''}
              {op.auditName ? ` ("${op.auditName}")` : ''}
              {op.runCompletedAt ? ` · run of ${formatDate(op.runCompletedAt)}` : ''}
              {op.pagesScanned != null ? ` · ${op.pagesScanned} ${op.pagesScanned === 1 ? 'page' : 'pages'}` : ''}
              {' · '}
              {op.reused ? 'reused audit' : 'fresh scan'}
              {op.note ? ` · ${op.note}` : ''}
            </p>
          )}

          <p role="status" aria-live="polite" className="sr-only">
            {announcement}
          </p>

          {op?.status === 'done' && op.insights && (
            <div className={busy ? 'opacity-50 pointer-events-none' : ''}>
              <ObservePointInsights insights={op.insights} />
            </div>
          )}

          {matrix && opAvailable && (
            <div className={busy ? 'opacity-50 pointer-events-none' : ''}>
              <EvidenceMatrix matrix={matrix} />
            </div>
          )}

          {matrix && !opAvailable && (
            <p className="text-xs text-ts-text-secondary">
              No ObservePoint data to compare yet – the evidence matrix appears once a completed audit run is available.
              TechStack detected {matrix.rows.length} technologies for this site.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

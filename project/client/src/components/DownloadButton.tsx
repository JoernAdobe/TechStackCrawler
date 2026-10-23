import { useState } from 'react';
import { createPortal } from 'react-dom';
import { FileSpreadsheet, FileDown, FileText, Loader2, RotateCcw } from 'lucide-react';
import type { AnalysisResult, UseCaseDiscoveryResult } from '../types/analysis';
import { downloadMarkdown } from '../lib/markdown';
import { downloadExcel } from '../lib/excel';
import { hostnameOf, loadFullReportData, triggerDownload } from '../lib/fullReport';
import { currentLicenseEstimates } from '../lib/licenseSizing';
import { trackUsage } from '../lib/visitor';
import { useBriefingPending } from './briefing/briefingStore';

interface DownloadButtonProps {
  results: AnalysisResult;
  onReset: () => void;
  /** Label of the reset action, e.g. "Back to list" in the past-analyses context. */
  resetLabel?: string;
  /** Latest use-case result from the polling hook (may be newer than `results`). */
  useCases?: UseCaseDiscoveryResult | null;
  /** Use Case Discovery is still running (or waiting for the Pre-Briefing). */
  useCasesPending?: boolean;
}

type Format = 'pdf' | 'markdown' | 'excel';

const base =
  'flex flex-1 md:flex-none items-center justify-center gap-2 px-3 sm:px-4 py-2 text-sm rounded-lg transition-all whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50';
const ghost = `${base} font-medium text-ts-text-primary border border-ts-border hover:bg-ts-surface-card hover:border-ts-accent/30 disabled:hover:bg-transparent disabled:hover:border-ts-border`;
const primary = `${base} sm:px-5 font-semibold text-white bg-gradient-to-r from-adobe-red to-adobe-red-dark hover:from-adobe-red-dark hover:to-[#B03522] hover:shadow-glow-red active:scale-[0.98] disabled:hover:shadow-none disabled:active:scale-100`;

/** Compact license-sizing rows for the server PDF (same numbers as the License Sizing tab). */
function pdfUrl(results: AnalysisResult): string {
  const rows = currentLicenseEstimates(results).estimates.map((e) => ({
    product: e.product, metric: e.metric, unit: e.unit, low: e.low, mid: e.mid, high: e.high,
    licenseUnit: e.licenseUnit, licenseUnits: e.licenseUnits, confidence: e.confidence, detected: e.detected,
  }));
  const query = rows.length ? `?sizing=${encodeURIComponent(JSON.stringify(rows))}` : '';
  return `/api/analyses/${results.id}/report.pdf${query}`;
}

export default function DownloadButton({
  results, onReset, resetLabel = 'New Analysis', useCases, useCasesPending = false,
}: DownloadButtonProps) {
  const briefingPending = useBriefingPending(results.id);
  const pending = briefingPending || useCasesPending;
  const [busy, setBusy] = useState<Format | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const waitingFor = [briefingPending && 'Client Pre-Briefing', useCasesPending && 'Use Cases'].filter(Boolean).join(' and ');
  const disabledTitle = pending ? `Available once the ${waitingFor} ${briefingPending && useCasesPending ? 'are' : 'is'} ready` : undefined;

  const run = async (format: Format) => {
    if (pending || busy) return;
    setBusy(format);
    setFailed(null);
    try {
      if (format === 'pdf') {
        triggerDownload(pdfUrl(results), '');
      } else {
        const data = await loadFullReportData(results, useCases);
        if (format === 'markdown') downloadMarkdown(data);
        else downloadExcel(data);
        trackUsage(format === 'markdown' ? 'export_markdown' : 'export_excel', results.id);
      }
    } catch {
      setFailed('Export failed – please try again.');
    } finally {
      setBusy(null);
    }
  };

  const icon = (format: Format, Icon: typeof FileText) =>
    pending || busy === format
      ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      : <Icon className="w-4 h-4" aria-hidden="true" />;

  const bar = (
    <div
      role="region"
      aria-label="Analysis actions"
      data-bottom-bar
      className="fixed bottom-0 left-0 right-0 bg-ts-surface/90 backdrop-blur-md border-t border-ts-border/50 z-40"
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-ts-accent/30 to-transparent" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
        <p className="hidden md:block min-w-0 truncate text-sm text-ts-text-secondary" role="status" aria-live="polite">
          {failed ? (
            <span className="text-adobe-red">{failed}</span>
          ) : pending ? (
            <>Full report is being prepared – waiting for the {waitingFor}…</>
          ) : (
            <>Analysis complete for <span className="text-ts-text-primary font-medium">{hostnameOf(results)}</span></>
          )}
        </p>
        <div className="flex w-full md:w-auto items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onReset}
            className="flex flex-1 md:flex-none items-center justify-center gap-2 px-3 sm:px-4 py-2 text-sm text-ts-text-secondary hover:text-ts-text-primary border border-ts-border rounded-lg hover:bg-ts-surface-card transition-all hover:border-ts-accent/30 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            {resetLabel}
          </button>
          {results.id != null && (
            <button
              type="button"
              onClick={() => void run('pdf')}
              disabled={pending || busy !== null}
              aria-busy={pending}
              aria-label="Download PDF report"
              title={disabledTitle ?? 'Full report as PDF (Pre-Briefing + all tabs)'}
              className={ghost}
            >
              {icon('pdf', FileText)}
              <span className="sm:hidden">PDF</span>
              <span className="hidden sm:inline">Download PDF</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void run('markdown')}
            disabled={pending || busy !== null}
            aria-busy={pending || busy === 'markdown'}
            aria-label="Download Markdown report"
            title={disabledTitle ?? 'Full report as Markdown (Pre-Briefing + all tabs)'}
            className={ghost}
          >
            {icon('markdown', FileDown)}
            <span className="sm:hidden">Markdown</span>
            <span className="hidden sm:inline">Download Markdown</span>
          </button>
          <button
            type="button"
            onClick={() => void run('excel')}
            disabled={pending || busy !== null}
            aria-busy={pending || busy === 'excel'}
            aria-label="Download Excel report"
            title={disabledTitle ?? 'Full report as Excel (one sheet per section)'}
            className={primary}
          >
            {icon('excel', FileSpreadsheet)}
            <span className="sm:hidden">Excel</span>
            <span className="hidden sm:inline">Download Excel</span>
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(bar, document.body);
}

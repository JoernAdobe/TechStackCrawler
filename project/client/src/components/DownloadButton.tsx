import { createPortal } from 'react-dom';
import { FileSpreadsheet, FileDown, FileText, RotateCcw } from 'lucide-react';
import type { AnalysisResult } from '../types/analysis';
import { downloadMarkdown } from '../lib/markdown';
import { downloadExcel } from '../lib/excel';
import { trackUsage } from '../lib/visitor';



interface DownloadButtonProps {
  results: AnalysisResult;
  onReset: () => void;
  /** Label of the reset action, e.g. "Back to list" in the past-analyses context. */
  resetLabel?: string;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function DownloadButton({ results, onReset, resetLabel = 'New Analysis' }: DownloadButtonProps) {
  const bar = (
    <div
      role="region"
      aria-label="Analysis actions"
      data-bottom-bar
      className="fixed bottom-0 left-0 right-0 bg-ts-surface/90 backdrop-blur-md border-t border-ts-border/50 z-40"
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-ts-accent/30 to-transparent" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
        <p className="hidden md:block min-w-0 truncate text-sm text-ts-text-secondary">
          Analysis complete for <span className="text-ts-text-primary font-medium">{hostnameOf(results.url)}</span>
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
            <a
              href={`/api/analyses/${results.id}/report.pdf`}
              download
              aria-label="Download PDF report"
              title="Full report as PDF (incl. Pre-Briefing, if available)"
              className="flex flex-1 md:flex-none items-center justify-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-ts-text-primary border border-ts-border rounded-lg hover:bg-ts-surface-card hover:border-ts-accent/30 transition-all whitespace-nowrap"
            >
              <FileText className="w-4 h-4" aria-hidden="true" />
              <span className="sm:hidden">PDF</span>
              <span className="hidden sm:inline">Download PDF</span>
            </a>
          )}
          <button
            type="button"
            onClick={() => { downloadMarkdown(results); trackUsage('export_markdown', results.id); }}
            aria-label="Download Markdown report"
            className="flex flex-1 md:flex-none items-center justify-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-ts-text-primary border border-ts-border rounded-lg hover:bg-ts-surface-card hover:border-ts-accent/30 transition-all whitespace-nowrap"
          >
            <FileDown className="w-4 h-4" aria-hidden="true" />
            <span className="sm:hidden">Markdown</span>
            <span className="hidden sm:inline">Download Markdown</span>
          </button>
          <button
            type="button"
            onClick={() => { downloadExcel(results); trackUsage('export_excel', results.id); }}
            aria-label="Download Excel report"
            className="flex flex-1 md:flex-none items-center justify-center gap-2 px-3 sm:px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-adobe-red to-adobe-red-dark rounded-lg hover:from-adobe-red-dark hover:to-[#B03522] transition-all hover:shadow-glow-red active:scale-[0.98] whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
            <span className="sm:hidden">Excel</span>
            <span className="hidden sm:inline">Download Excel</span>
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(bar, document.body);
}

import { createPortal } from 'react-dom';
import { FileSpreadsheet, FileDown, RotateCcw } from 'lucide-react';
import type { AnalysisResult } from '../types/analysis';
import { downloadMarkdown } from '../lib/markdown';
import { downloadExcel } from '../lib/excel';

interface DownloadButtonProps {
  results: AnalysisResult;
  onReset: () => void;
}

export default function DownloadButton({ results, onReset }: DownloadButtonProps) {
  const bar = (
    <div className="fixed bottom-0 left-0 right-0 bg-ts-surface/90 backdrop-blur-md border-t border-ts-border/50 z-40">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-ts-accent/30 to-transparent" />
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <p className="text-sm text-ts-text-secondary">
          Analysis complete for{' '}
          <span className="text-ts-text-primary font-medium">
            {(() => {
              try {
                return new URL(results.url).hostname;
              } catch {
                return results.url;
              }
            })()}
          </span>
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={onReset}
            className="flex items-center gap-2 px-4 py-2 text-sm text-ts-text-secondary hover:text-ts-text-primary border border-ts-border rounded-lg hover:bg-ts-surface-card transition-all hover:border-ts-accent/30"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            New Analysis
          </button>
          <button
            onClick={() => downloadExcel(results)}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-adobe-red to-red-700 rounded-lg hover:from-adobe-red-dark hover:to-red-800 transition-all hover:shadow-glow-red hover:scale-[1.02] active:scale-[0.98]"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Download Excel
          </button>
          <button
            onClick={() => downloadMarkdown(results)}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-adobe-red to-red-700 rounded-lg hover:from-adobe-red-dark hover:to-red-800 transition-all hover:shadow-glow-red hover:scale-[1.02] active:scale-[0.98]"
          >
            <FileDown className="w-4 h-4" />
            Download Markdown
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(bar, document.body);
}

import { createPortal } from 'react-dom';
import type { AnalysisResult } from '../types/analysis';
import { downloadMarkdown } from '../lib/markdown';
import { downloadExcel } from '../lib/excel';

interface DownloadButtonProps {
  results: AnalysisResult;
  onReset: () => void;
}

export default function DownloadButton({ results, onReset }: DownloadButtonProps) {
  const bar = (
    <div className="fixed bottom-0 left-0 right-0 bg-ts-surface/90 backdrop-blur-md border-t border-ts-border z-40">
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
            className="px-4 py-2 text-sm text-ts-text-secondary hover:text-ts-text-primary border border-ts-border rounded-lg hover:bg-ts-surface-card transition-all"
          >
            New Analysis
          </button>
          <button
            onClick={() => downloadExcel(results)}
            className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-adobe-red to-red-700 rounded-lg hover:from-adobe-red-dark hover:to-red-800 transition-all flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Download Excel
          </button>
          <button
            onClick={() => downloadMarkdown(results)}
            className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-adobe-red to-red-700 rounded-lg hover:from-adobe-red-dark hover:to-red-800 transition-all flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Download Markdown
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(bar, document.body);
}

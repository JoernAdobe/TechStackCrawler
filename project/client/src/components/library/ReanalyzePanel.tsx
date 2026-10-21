import { useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import BriefingOptions from '../briefing/BriefingOptions';
import { loadBriefingSections } from '../briefing/prefs';
import type { BriefingSectionId } from '../../types/briefing';

interface ReanalyzePanelProps {
  url: string;
  /** Vorbelegung des Pre-Briefing-Schalters (z. B. wenn es schon ein Briefing gab). */
  defaultBriefing: boolean;
  onStart: (url: string, briefingSections: BriefingSectionId[] | null) => void;
  onClose: () => void;
}

/** Bestätigungs-Panel für eine frische Analyse; die bestehende bleibt in der Library erhalten. */
export default function ReanalyzePanel({ url, defaultBriefing, onStart, onClose }: ReanalyzePanelProps) {
  const [briefing, setBriefing] = useState(defaultBriefing);
  const [sections, setSections] = useState<BriefingSectionId[]>(loadBriefingSections);

  return (
    <div
      role="region"
      aria-label="Re-analyze account"
      className="mt-4 rounded-2xl border border-adobe-red/30 bg-ts-surface-card p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ts-text-primary">Run a fresh analysis</p>
          <p className="mt-1 text-xs text-ts-text-secondary">
            Re-scans <span className="text-ts-text-primary break-all">{url}</span> for up-to-date data
            (about 1–2 min, AI costs apply; Pre-Briefing adds ~5–6 min). The existing analysis stays in the library.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-lg p-1 text-ts-text-secondary hover:text-ts-text-primary hover:bg-ts-surface-light"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      <BriefingOptions
        enabled={briefing}
        onEnabledChange={setBriefing}
        sections={sections}
        onSectionsChange={setSections}
      />
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-ts-border text-ts-text-secondary hover:text-ts-text-primary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onStart(url, briefing ? sections : null)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-adobe-red to-adobe-red-dark text-white hover:from-adobe-red-dark hover:to-[#B03522]"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Start re-analysis
        </button>
      </div>
    </div>
  );
}

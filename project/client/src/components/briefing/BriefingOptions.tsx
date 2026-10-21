import { useId } from 'react';
import { FileSearch } from 'lucide-react';
import { BRIEFING_CREDIT, type BriefingSectionId } from '../../types/briefing';
import { BriefingSectionPicker } from './BriefingSectionPicker';
import ReviewSourcesNote from './ReviewSourcesNote';

interface BriefingOptionsProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  sections: BriefingSectionId[];
  onSectionsChange: (sections: BriefingSectionId[]) => void;
  disabled?: boolean;
}

/** Schalter „Add Client Pre-Briefing“ unter dem URL-Feld; klappt die Abschnittsauswahl auf. */
export default function BriefingOptions({
  enabled, onEnabledChange, sections, onSectionsChange, disabled,
}: BriefingOptionsProps) {
  const uid = useId();
  const panelId = `${uid}-panel`;

  return (
    <div className="mt-4 text-left">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-controls={panelId}
          aria-describedby={`${uid}-hint`}
          onClick={() => onEnabledChange(!enabled)}
          disabled={disabled}
          className="group flex items-center gap-3 rounded-full py-1 pr-2 text-sm font-medium text-ts-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-adobe-red disabled:opacity-50"
        >
          <span
            aria-hidden="true"
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors motion-reduce:transition-none ${
              enabled ? 'border-adobe-red bg-adobe-red' : 'border-ts-border bg-ts-surface-light group-hover:border-ts-accent/60'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
                enabled ? 'translate-x-[18px]' : 'translate-x-[2px]'
              }`}
            />
          </span>
          <FileSearch className="h-4 w-4 text-ts-text-secondary" aria-hidden="true" />
          Add Client Pre-Briefing
        </button>
        <span id={`${uid}-hint`} className="text-xs text-ts-text-secondary">
          Adds ~5–10 minutes; runs in the background after the scan.
        </span>
      </div>

      <div
        id={panelId}
        inert={!enabled}
        aria-hidden={!enabled}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
          enabled ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="mt-3 rounded-2xl border border-ts-border bg-ts-surface-card p-4 sm:p-5">
            <BriefingSectionPicker value={sections} onChange={onSectionsChange} disabled={disabled} />
            <p className="mt-3 text-xs text-ts-text-secondary/90">{BRIEFING_CREDIT}</p>
          </div>
          <ReviewSourcesNote className="mt-3" />
        </div>
      </div>
    </div>
  );
}

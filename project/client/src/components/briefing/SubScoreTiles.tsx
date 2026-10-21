import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { SubScore } from '../../types/briefing';
import { BAND_STYLES, bandForScore } from './meta';
import DrillLink, { type DrillHandler } from './DrillLink';
import { SourceList } from './BriefingSources';

function KindBadge({ kind }: { kind: SubScore['kind'] }) {
  return (
    <span
      className={`rounded-full border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide ${
        kind === 'measured' ? 'border-sky-400/40 text-sky-200' : 'border-violet-400/40 text-violet-200'
      }`}
      title={kind === 'measured' ? 'Calculated from scan data' : 'Rated by AI against a fixed rubric'}
    >
      {kind}
    </span>
  );
}

function Bar({ value }: { value: number | null }) {
  if (value == null) {
    return <div className="h-1.5 rounded-full border border-dashed border-ts-border" aria-hidden="true" />;
  }
  const style = BAND_STYLES[bandForScore(value)];
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-ts-border" aria-hidden="true">
      <div className="h-full rounded-full" style={{ width: `${Math.max(2, value)}%`, background: style.stroke }} />
    </div>
  );
}

/** Fünf Sub-Score-Kacheln; Klick klappt Begründung, Quellen und Drilldown auf. */
export default function SubScoreTiles({ scores, onDrill }: { scores: SubScore[]; onDrill: DrillHandler }) {
  const [openKey, setOpenKey] = useState<SubScore['key'] | null>(null);
  const uid = useId();
  const open = scores.find((s) => s.key === openKey) ?? null;

  return (
    <div>
      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {scores.map((s) => {
          const isOpen = openKey === s.key;
          return (
            <li key={s.key}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`${uid}-detail`}
                onClick={() => setOpenKey(isOpen ? null : s.key)}
                className={`flex h-full w-full flex-col gap-2 rounded-xl border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-adobe-red ${
                  isOpen ? 'border-adobe-red/50 bg-adobe-red/5' : 'border-ts-border bg-ts-surface-light hover:border-ts-accent/50'
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium leading-snug text-ts-text-primary">{s.label}</span>
                  <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-ts-text-secondary transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </span>
                <span className="flex items-baseline gap-1">
                  {s.value == null ? (
                    <span className="text-sm italic text-ts-text-secondary">not assessed</span>
                  ) : (
                    <>
                      <span className="text-2xl font-bold tabular-nums text-ts-text-primary">{Math.round(s.value)}</span>
                      <span className="text-xs text-ts-text-secondary">/ 100</span>
                    </>
                  )}
                </span>
                <Bar value={s.value} />
                <span className="flex items-center justify-between gap-2 text-xs text-ts-text-secondary">
                  <span>Weight {Math.round(s.weight * 100)}%</span>
                  <KindBadge kind={s.kind} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div id={`${uid}-detail`} aria-live="polite">
        {open && (
          <div className="mt-3 rounded-xl border border-ts-border bg-ts-surface-light p-4 animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none">
            <p className="text-sm font-semibold text-ts-text-primary">
              {open.label}
              {open.kind === 'rated' && open.rubricLevel != null && (
                <span className="ml-2 text-xs font-normal text-ts-text-secondary">Rubric level {open.rubricLevel} of 5</span>
              )}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ts-text-secondary">{open.rationale}</p>
            {open.value == null && (
              <p className="mt-1 text-xs text-ts-text-secondary">Excluded from the overall score; confidence is reduced instead.</p>
            )}
            {open.sources && open.sources.length > 0 && (
              <div className="mt-3">
                <SourceList sources={open.sources} />
              </div>
            )}
            {open.sectionRefs.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-xs text-ts-text-secondary">View section{open.sectionRefs.length > 1 ? 's' : ''}:</span>
                {open.sectionRefs.map((id) => <DrillLink key={id} id={id} onDrill={onDrill} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

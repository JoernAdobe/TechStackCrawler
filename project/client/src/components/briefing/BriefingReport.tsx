import { AlertTriangle } from 'lucide-react';
import type { BriefingResult, BriefingSection, BriefingSectionStatus } from '../../types/briefing';
import BriefingBlocks from './BriefingBlocks';
import { SourceList } from './BriefingSources';
import type { DrillHandler } from './DrillLink';
import { sectionAnchor, sectionMeta } from './meta';
import SectionIcon from './SectionIcon';

const STATUS_BADGE: Partial<Record<BriefingSectionStatus, { label: string; cls: string }>> = {
  thin: { label: 'Thin data', cls: 'border-amber-400/40 bg-amber-400/10 text-amber-200' },
  error: { label: 'Research failed', cls: 'border-red-400/40 bg-red-400/10 text-red-200' },
  skipped: { label: 'Not included', cls: 'border-ts-border text-ts-text-secondary' },
};

function StatusBadge({ status }: { status: BriefingSectionStatus }) {
  const badge = STATUS_BADGE[status];
  if (!badge) return null;
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>;
}

function ReportSection({ section, highlighted }: { section: BriefingSection; highlighted: boolean }) {
  const meta = sectionMeta(section.id);
  return (
    <section
      id={sectionAnchor(section.id)}
      aria-labelledby={`${sectionAnchor(section.id)}-title`}
      tabIndex={-1}
      className={`scroll-mt-32 rounded-2xl border p-4 transition-[border-color,box-shadow] duration-700 focus:outline-none sm:p-6 motion-reduce:transition-none ${
        highlighted ? 'border-adobe-red/70 shadow-[0_0_0_3px_rgba(232,80,58,0.25)]' : 'border-ts-border'
      } ${section.status === 'skipped' ? 'bg-transparent' : 'bg-ts-surface-card'}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-adobe-red">{section.eyebrow}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 id={`${sectionAnchor(section.id)}-title`} className="flex items-center gap-2 text-lg font-semibold text-ts-text-primary">
          {meta && <SectionIcon meta={meta} className="h-5 w-5 text-ts-text-secondary" />}
          {section.title}
        </h4>
        <StatusBadge status={section.status} />
      </div>

      {section.blocks.length > 0 && (
        <div className="mt-4">
          <BriefingBlocks blocks={section.blocks} />
        </div>
      )}

      {section.gaps.length > 0 && (
        <div className="mt-4 rounded-lg border border-ts-border bg-ts-surface-light/60 px-3.5 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ts-text-secondary">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            Gaps
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ts-text-secondary">
            {section.gaps.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </div>
      )}

      {section.sources.length > 0 && (
        <div className="mt-4 border-t border-ts-border/70 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ts-text-secondary">Sources</p>
          <SourceList sources={section.sources} />
        </div>
      )}
    </section>
  );
}

interface BriefingReportProps {
  result: BriefingResult;
  highlightId: string | null;
  onDrill: DrillHandler;
}

/** Vollständiges Briefing nativ in React (Drilldown unter der Executive-Ansicht). */
export default function BriefingReport({ result, highlightId, onDrill }: BriefingReportProps) {
  return (
    <div className="space-y-4">
      <nav aria-label="Briefing sections">
        <ul className="flex flex-wrap gap-1.5">
          {result.sections.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onDrill(s.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-adobe-red ${
                  s.status === 'skipped'
                    ? 'border-ts-border/60 text-ts-text-secondary/70 hover:text-ts-text-secondary'
                    : 'border-ts-border text-ts-text-secondary hover:border-ts-accent/50 hover:text-ts-text-primary'
                }`}
              >
                {s.title}
                {s.status === 'thin' && <span className="ml-1 text-amber-300" aria-label="thin data">•</span>}
                {s.status === 'error' && <span className="ml-1 text-red-300" aria-label="research failed">•</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {result.sections.map((s) => (
        <ReportSection key={s.id} section={s} highlighted={highlightId === sectionAnchor(s.id)} />
      ))}
    </div>
  );
}

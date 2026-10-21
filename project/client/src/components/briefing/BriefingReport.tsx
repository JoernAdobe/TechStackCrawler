import { AlertTriangle, ArrowDown } from 'lucide-react';
import type { BriefingResult, BriefingSection, BriefingSectionStatus } from '../../types/briefing';
import BriefingBlocks from './BriefingBlocks';
import { SourceList } from './BriefingSources';
import { ADOBE_OPPORTUNITY_SECTION, MERGED_OPPORTUNITY_ANCHOR, stickyChromeBottom } from './briefingStore';
import { prefersReducedMotion, sectionAnchor, sectionMeta } from './meta';
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
}

function hasMergedContent(section: BriefingSection): boolean {
  return section.status !== 'skipped' && (section.blocks.length > 0 || section.gaps.length > 0);
}

/** Verweis statt Duplikat: Adobe Opportunity steht in der Sektion „Opportunities“. */
function MergedOpportunityPointer({ section }: { section: BriefingSection }) {
  const jump = () => {
    const el = document.getElementById(MERGED_OPPORTUNITY_ANCHOR);
    if (!el) return;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - stickyChromeBottom() - 16,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
    el.focus({ preventScroll: true });
  };
  return (
    <section
      id={sectionAnchor(section.id)}
      tabIndex={-1}
      className="scroll-mt-32 flex flex-col gap-3 rounded-2xl border border-dashed border-ts-border p-4 focus:outline-none sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-adobe-red">{section.eyebrow}</p>
        <p className="mt-1 text-sm text-ts-text-secondary">
          <span className="font-semibold text-ts-text-primary">{section.title}</span> is shown once, together with the
          tech-stack opportunities, so nothing is counted twice.
        </p>
      </div>
      <button
        type="button"
        onClick={jump}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-ts-border px-3 py-1.5 text-sm font-medium text-ts-text-primary hover:border-ts-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-adobe-red"
      >
        Go to Opportunities <ArrowDown className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  );
}

/** Vollständiges Briefing nativ in React (Drilldown unter der Executive-Ansicht). */
export default function BriefingReport({ result, highlightId }: BriefingReportProps) {
  return (
    <div className="space-y-4">
      {result.sections.map((s) =>
        s.id === ADOBE_OPPORTUNITY_SECTION && hasMergedContent(s)
          ? <MergedOpportunityPointer key={s.id} section={s} />
          : <ReportSection key={s.id} section={s} highlighted={highlightId === sectionAnchor(s.id)} />,
      )}
    </div>
  );
}

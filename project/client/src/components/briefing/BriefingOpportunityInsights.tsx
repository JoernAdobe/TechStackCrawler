import { FileSearch } from 'lucide-react';
import BriefingBlocks from './BriefingBlocks';
import { SourceList } from './BriefingSources';
import type { BriefingSectionId } from '../../types/briefing';
import { ADOBE_OPPORTUNITY_SECTION, MERGED_SECTIONS, useSharedBriefingResult } from './briefingStore';

/**
 * Pre-Briefing-Abschnitt, eingebettet in den passenden Analyzer-Tab (Tech Stack, GEO Score,
 * Opportunities) – damit jeder Inhalt im Ergebnis nur einmal erscheint.
 */
export function BriefingMergedSection({ analysisId, sectionId }: { analysisId?: number; sectionId: BriefingSectionId }) {
  const result = useSharedBriefingResult(analysisId);
  const target = MERGED_SECTIONS[sectionId];
  const section = result?.sections.find((s) => s.id === sectionId);
  if (!target || !section || section.status === 'skipped' || (section.blocks.length === 0 && section.gaps.length === 0)) return null;
  const anchor = target.anchor;

  return (
    <section
      id={anchor}
      aria-labelledby={`${anchor}-title`}
      tabIndex={-1}
      className="mt-8 scroll-mt-40 rounded-2xl border border-ts-border bg-ts-surface-card p-4 focus:outline-none sm:p-6"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-adobe-red">{section.eyebrow}</p>
      <h3 id={`${anchor}-title`} className="mt-1 flex items-center gap-2 text-lg font-semibold text-ts-text-primary">
        <FileSearch className="h-5 w-5 text-adobe-red" strokeWidth={1.5} aria-hidden="true" />
        {target.heading}
      </h3>
      <p className="mt-1 text-xs text-ts-text-secondary">{target.subtitle}</p>
      {section.blocks.length > 0 && (
        <div className="mt-4">
          <BriefingBlocks blocks={section.blocks} />
        </div>
      )}
      {section.gaps.length > 0 && (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ts-text-secondary">
          {section.gaps.map((g, i) => <li key={i}>{g}</li>)}
        </ul>
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

export default function BriefingOpportunityInsights({ analysisId }: { analysisId?: number }) {
  return <BriefingMergedSection analysisId={analysisId} sectionId={ADOBE_OPPORTUNITY_SECTION} />;
}

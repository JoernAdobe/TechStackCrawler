import { FileSearch } from 'lucide-react';
import BriefingBlocks from './BriefingBlocks';
import { SourceList } from './BriefingSources';
import { ADOBE_OPPORTUNITY_SECTION, MERGED_OPPORTUNITY_ANCHOR, useSharedBriefingResult } from './briefingStore';

/**
 * Adobe-Opportunity-Abschnitt des Pre-Briefings, eingebettet in die Sektion
 * „Opportunities“ – damit Adobe-Chancen im Ergebnis nur einmal erscheinen.
 */
export default function BriefingOpportunityInsights({ analysisId }: { analysisId?: number }) {
  const result = useSharedBriefingResult(analysisId);
  const section = result?.sections.find((s) => s.id === ADOBE_OPPORTUNITY_SECTION);
  if (!section || section.status === 'skipped' || (section.blocks.length === 0 && section.gaps.length === 0)) return null;

  return (
    <section
      id={MERGED_OPPORTUNITY_ANCHOR}
      aria-labelledby={`${MERGED_OPPORTUNITY_ANCHOR}-title`}
      tabIndex={-1}
      className="mt-8 scroll-mt-40 rounded-2xl border border-ts-border bg-ts-surface-card p-4 focus:outline-none sm:p-6"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-adobe-red">{section.eyebrow}</p>
      <h3 id={`${MERGED_OPPORTUNITY_ANCHOR}-title`} className="mt-1 flex items-center gap-2 text-lg font-semibold text-ts-text-primary">
        <FileSearch className="h-5 w-5 text-adobe-red" strokeWidth={1.5} aria-hidden="true" />
        Adobe plays from the Client Pre-Briefing
      </h3>
      <p className="mt-1 text-xs text-ts-text-secondary">
        Researched from public sources and combined with the tech-stack opportunities above.
      </p>
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

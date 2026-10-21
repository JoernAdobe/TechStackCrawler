import { ArrowRight } from 'lucide-react';
import type { BriefingSectionId } from '../../types/briefing';
import { sectionTitle } from './meta';

export type DrillHandler = (id: BriefingSectionId) => void;

/** „→ Section“-Link: klappt den vollständigen Report auf und springt zum Abschnitt. */
export default function DrillLink({ id, onDrill, label }: { id: BriefingSectionId; onDrill: DrillHandler; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => onDrill(id)}
      className="inline-flex items-center gap-1 rounded text-xs font-medium text-ts-accent-light hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-adobe-red"
    >
      <ArrowRight className="h-3 w-3" aria-hidden="true" />
      {label ?? sectionTitle(id)}
    </button>
  );
}

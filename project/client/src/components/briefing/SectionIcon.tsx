import { createElement } from 'react';
import type { BriefingSectionMeta } from '../../types/briefing';
import { sectionIcon } from './meta';

/** Lucide-Icon eines Abschnitts (Name aus BRIEFING_SECTIONS). */
export default function SectionIcon({ meta, className }: { meta: Pick<BriefingSectionMeta, 'icon'>; className?: string }) {
  return createElement(sectionIcon(meta), { className, 'aria-hidden': true });
}

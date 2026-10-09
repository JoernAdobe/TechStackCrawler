import { useState } from 'react';
import type { AnalysisResult } from '../types/analysis';
import EnrichmentPanels from './EnrichmentPanels';
import GeoScorePanel from './GeoScorePanel';
import StackHistory from './StackHistory';
import FeedbackWidget from './FeedbackWidget';
import DeckButton from './DeckButton';

/**
 * EAA-Parität: zusätzliche Bausteine unter einer Analyse (Deck, Enrichments, GEO, History, Feedback).
 * Hält eine lokale Kopie der Analyse, damit Enrichment-Ergebnisse sofort sichtbar werden.
 */
export default function ParityExtras({ analysis }: { analysis: AnalysisResult }) {
  const [override, setOverride] = useState<{ base: AnalysisResult; value: AnalysisResult } | null>(null);
  const current = override && override.base === analysis ? override.value : analysis;
  const setCurrent = (value: AnalysisResult) => setOverride({ base: analysis, value });

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      {current.id && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ts-text-primary">Deep Dive &amp; Export</h2>
          <DeckButton href={`/api/analyses/${current.id}/deck.pptx`} />
        </div>
      )}
      <EnrichmentPanels analysis={current} onUpdate={setCurrent} />
      <GeoScorePanel analysis={current} onUpdate={setCurrent} />
      <StackHistory url={current.finalUrl ?? current.url} />
      {current.id && <FeedbackWidget analysisId={current.id} />}
    </div>
  );
}

import { useState } from 'react';
import type { AnalysisResult } from '../types/analysis';
import EnrichmentPanels from './EnrichmentPanels';
import GeoScorePanel from './GeoScorePanel';
import ObservePointPanel from './ObservePointPanel';
import StackHistory from './StackHistory';
import FeedbackWidget from './FeedbackWidget';
import DeckButton from './DeckButton';
import ErrorBoundary from './ErrorBoundary';

/**
 * EAA-Parität: zusätzliche Bausteine unter einer Analyse (Deck, Enrichments, GEO, History, Feedback).
 * Hält eine lokale Kopie der Analyse, damit Enrichment-Ergebnisse sofort sichtbar werden.
 */
export default function ParityExtras({ analysis }: { analysis: AnalysisResult }) {
  const [override, setOverride] = useState<{ base: AnalysisResult; value: AnalysisResult } | null>(null);
  const current = override && override.base === analysis ? override.value : analysis;
  const setCurrent = (value: AnalysisResult) => setOverride({ base: analysis, value });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {current.id && (
        <div id="section-deep-dive" className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ts-text-primary">Deep Dive &amp; Export</h2>
          <DeckButton href={`/api/analyses/${current.id}/deck.pptx`} />
        </div>
      )}
      <ErrorBoundary label="Enrichments" compact resetKey={current}>
        <EnrichmentPanels analysis={current} onUpdate={setCurrent} />
      </ErrorBoundary>
      <ErrorBoundary label="ObservePoint" compact resetKey={current}>
        <ObservePointPanel analysis={current} onUpdate={setCurrent} />
      </ErrorBoundary>
      <ErrorBoundary label="GEO score" compact resetKey={current}>
        <GeoScorePanel analysis={current} onUpdate={setCurrent} />
      </ErrorBoundary>
      <ErrorBoundary label="Stack history" compact resetKey={current.url}>
        <StackHistory url={current.finalUrl ?? current.url} />
      </ErrorBoundary>
      {current.id && (
        <ErrorBoundary label="Feedback" compact>
          <FeedbackWidget analysisId={current.id} />
        </ErrorBoundary>
      )}
    </div>
  );
}

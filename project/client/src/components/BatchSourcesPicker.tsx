import { useEffect, useState } from 'react';
import { Layers, Sparkles } from 'lucide-react';
import type { BatchKind } from '../types/parity';
import { MAX_BRIEFING_ITEMS, type BatchEnrichmentOptions } from '../types/batchAccount';
import { BRIEFING_CREDIT } from '../types/briefing';
import { apiRequest } from '../lib/apiClient';
import { BriefingSectionPicker } from './briefing/BriefingSectionPicker';
import { ALL_SECTIONS } from './briefing/meta';

interface SourcesStatus {
  observepoint: boolean;
  semrush: boolean;
  pagespeedKey: boolean;
  maxCostlyItemsLimit: number;
  maxBriefingItems?: number;
  defaults: Record<BatchKind, BatchEnrichmentOptions>;
}

type BoolKey = Exclude<keyof BatchEnrichmentOptions, 'maxCostlyItems' | 'briefing' | 'briefingSections'>;

interface SourceDef {
  key: BoolKey;
  label: string;
  cost: string;
  costly?: boolean;
  /** Grund, warum die Quelle hier nicht nutzbar ist (Konfiguration/Modus). */
  unavailable?: (s: SourcesStatus | null, ctx: { aiAnalysis: boolean }) => string | undefined;
}

const SOURCES: SourceDef[] = [
  { key: 'traffic', label: 'Traffic rank (Tranco)', cost: 'Free · ~1 request/s' },
  {
    key: 'observepoint',
    label: 'ObservePoint (reuse existing audits)',
    cost: 'Read-only · never starts scans',
    unavailable: (s) => (s && !s.observepoint ? 'Not configured on this server' : undefined),
  },
  { key: 'mobileApps', label: 'Mobile apps (App Store)', cost: 'Free · ~20 requests/min' },
  {
    key: 'lighthouse',
    label: 'Performance (PageSpeed / Lighthouse)',
    cost: 'Google quota · ~20–60 s per URL',
    costly: true,
  },
  {
    key: 'semrush',
    label: 'Traffic visits (Semrush)',
    cost: 'Paid API units · 3 calls per domain',
    costly: true,
    unavailable: (s) => (s && !s.semrush ? 'SEMRUSH_API_KEY not configured' : undefined),
  },
  { key: 'geo', label: 'GEO score / AI visibility', cost: 'LLM · many calls per domain', costly: true },
  {
    key: 'useCases',
    label: 'Use case discovery',
    cost: 'LLM · needs full AI analysis',
    costly: true,
    unavailable: (_s, ctx) => (!ctx.aiAnalysis ? 'Requires full AI analysis' : undefined),
  },
  { key: 'multiPage', label: 'Crawl additional subpages', cost: 'Slower · detection mode only' },
];

interface Props {
  mode: BatchKind;
  aiAnalysis: boolean;
  value: BatchEnrichmentOptions | null;
  onChange: (v: BatchEnrichmentOptions) => void;
}

/** Auswahl der Enrichment-Quellen pro Item, mit Kosten-/Quota-Hinweisen. */
export default function BatchSourcesPicker({ mode, aiAnalysis, value, onChange }: Props) {
  const [status, setStatus] = useState<SourcesStatus | null>(null);

  useEffect(() => {
    let alive = true;
    apiRequest<SourcesStatus>('/api/batches/sources')
      .then((s) => {
        if (!alive) return;
        setStatus(s);
        onChange(s.defaults[mode]);
      })
      .catch(() => {
        /* Server alt/offline → Server-Defaults greifen */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur beim Moduswechsel neu laden
  }, [mode]);

  if (!value) return null;
  const ctx = { aiAnalysis };
  const costlySelected =
    SOURCES.some((s) => s.costly && value[s.key] && !s.unavailable?.(status, ctx)) || value.briefing === true;
  const limit = status?.maxCostlyItemsLimit ?? 50;

  return (
    <fieldset className="rounded-xl border border-ts-border bg-ts-surface-light/40 p-3">
      <legend className="flex items-center gap-1.5 px-1 text-xs font-medium text-ts-text-secondary">
        <Layers className="w-3.5 h-3.5" /> Data sources per URL
      </legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
        {SOURCES.map((s) => {
          if (s.key === 'multiPage' && aiAnalysis) return null;
          const reason = s.unavailable?.(status, ctx);
          const id = `src-${s.key}`;
          return (
            <label key={s.key} htmlFor={id} className={`flex items-start gap-2 min-w-0 ${reason ? 'opacity-50' : ''}`}>
              <input
                id={id}
                type="checkbox"
                className="mt-0.5 shrink-0"
                disabled={Boolean(reason)}
                checked={!reason && value[s.key]}
                onChange={(e) => onChange({ ...value, [s.key]: e.target.checked })}
              />
              <span className="min-w-0">
                <span className="block text-sm text-ts-text-primary">
                  {s.label}
                  {s.costly && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-ts-warning">quota</span>}
                </span>
                <span className="block text-xs text-ts-text-secondary truncate">{reason ?? s.cost}</span>
              </span>
            </label>
          );
        })}
      </div>
      <BriefingOption
        value={value}
        onChange={onChange}
        aiAnalysis={aiAnalysis}
        maxItems={status?.maxBriefingItems ?? MAX_BRIEFING_ITEMS}
      />
      {costlySelected && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ts-text-secondary">
          <label htmlFor="src-max">Run quota/LLM sources for at most</label>
          <input
            id="src-max"
            type="number"
            min={1}
            max={limit}
            value={value.maxCostlyItems}
            onChange={(e) =>
              onChange({ ...value, maxCostlyItems: Math.min(limit, Math.max(1, Number(e.target.value) || 1)) })
            }
            className="w-16 px-2 py-1 bg-ts-surface-light border border-ts-border rounded text-ts-text-primary"
          />
          <span>URLs (in list order).</span>
          {value.lighthouse && !status?.pagespeedKey && (
            <span className="text-ts-warning">No PageSpeed API key – shared quota, stops cleanly when exhausted.</span>
          )}
          {(value.geo || value.useCases || value.briefing) && mode === 'bulk' && (
            <span className="text-ts-warning">LLM sources require admin approval for anonymous bulk runs.</span>
          )}
        </div>
      )}
    </fieldset>
  );
}

interface BriefingOptionProps {
  value: BatchEnrichmentOptions;
  onChange: (v: BatchEnrichmentOptions) => void;
  aiAnalysis: boolean;
  maxItems: number;
}

/** Opt-in „Client Pre-Briefing“ für die ersten min(maxCostlyItems, 20) erfolgreichen URLs. */
function BriefingOption({ value, onChange, aiAnalysis, maxItems }: BriefingOptionProps) {
  const enabled = value.briefing === true;
  const cap = Math.min(value.maxCostlyItems, maxItems);
  return (
    <div className="mt-3 border-t border-ts-border pt-3">
      <label htmlFor="src-briefing" className="flex items-start gap-2 min-w-0">
        <input
          id="src-briefing"
          type="checkbox"
          className="mt-0.5 shrink-0"
          checked={enabled}
          onChange={(e) =>
            onChange({
              ...value,
              briefing: e.target.checked,
              briefingSections: value.briefingSections ?? [...ALL_SECTIONS],
            })
          }
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm text-ts-text-primary">
            <Sparkles className="w-3.5 h-3.5 text-ts-accent" aria-hidden="true" />
            Client Pre-Briefing (max {maxItems} accounts)
            <span className="text-[10px] uppercase tracking-wide text-ts-warning">LLM</span>
          </span>
          <span className="block text-xs text-ts-text-secondary">{BRIEFING_CREDIT}</span>
          <span className="block text-xs text-ts-text-secondary">
            ~5–10 min and ~$1–3 per account, runs after the scan. Sorted by Pre-Briefing Score in the results.
          </span>
        </span>
      </label>
      {enabled && (
        <div className="mt-2 pl-6 space-y-2">
          <p className="text-xs text-ts-text-secondary">
            Briefings for the first {cap} successfully scanned URL{cap === 1 ? '' : 's'} (limit = min(max quota URLs, {maxItems})).
            {!aiAnalysis && ' These URLs get a full AI analysis, because a briefing needs a saved analysis.'}
          </p>
          <BriefingSectionPicker
            compact
            value={value.briefingSections ?? [...ALL_SECTIONS]}
            onChange={(v) => onChange({ ...value, briefingSections: v })}
          />
        </div>
      )}
    </div>
  );
}

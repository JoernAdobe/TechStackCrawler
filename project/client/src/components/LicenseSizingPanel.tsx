import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, Info, RotateCcw, Scale } from 'lucide-react';
import type { AnalysisResult } from '../types/analysis';
import {
  ASSUMPTION_META,
  compact,
  defaultAssumptions,
  estimateLicenses,
  loadOverrides,
  pageViewsPerMonth,
  sizingBasis,
  storageKey,
  type Confidence,
  type SizingAssumptions,
  type SizingEstimate,
} from '../lib/licenseSizing';

const inputClass =
  'w-full px-3 py-2 bg-ts-surface border border-ts-border rounded-lg text-sm text-ts-text-primary focus:outline-none focus:border-ts-accent tabular-nums';

const BASE_KEYS: Array<keyof SizingAssumptions> = ['monthlyVisits', 'pagesPerVisit', 'monthlyUniqueVisitors', 'knownCustomers'];

const CONFIDENCE_STYLE: Record<Confidence, { label: string; className: string }> = {
  high: { label: 'High confidence', className: 'bg-ts-success/10 text-ts-success border-ts-success/30' },
  medium: { label: 'Medium confidence', className: 'bg-ts-warning/10 text-ts-warning border-ts-warning/30' },
  low: { label: 'Rough estimate', className: 'bg-ts-surface text-ts-text-secondary border-ts-border' },
};


function AssumptionInput({
  name,
  value,
  measured,
  onChange,
}: {
  name: keyof SizingAssumptions;
  value: number;
  measured?: boolean;
  onChange: (name: keyof SizingAssumptions, value: number) => void;
}) {
  const meta = ASSUMPTION_META[name];
  return (
    <label className="text-xs text-ts-text-secondary space-y-1 block">
      <span className="flex items-center gap-1.5">
        {meta.label}
        {meta.unit && <span className="text-ts-text-secondary/70">({meta.unit})</span>}
        {measured && <span className="rounded bg-ts-accent/15 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-ts-accent">measured</span>}
      </span>
      <input
        type="number"
        min={0}
        step={meta.step}
        className={inputClass}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(name, Math.max(0, Number(e.target.value) || 0))}
      />
    </label>
  );
}

function EstimateCard({
  e,
  assumptions,
  onChange,
}: {
  e: SizingEstimate;
  assumptions: SizingAssumptions;
  onChange: (name: keyof SizingAssumptions, value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const conf = CONFIDENCE_STYLE[e.confidence];
  const midPct = e.high > e.low ? ((e.mid - e.low) / (e.high - e.low)) * 100 : 50;
  const money = e.key === 'commerce';
  return (
    <article className="flex flex-col rounded-xl border border-ts-border bg-ts-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ts-text-primary">{e.product}</h3>
          <p className="text-xs text-ts-text-secondary">{e.metric}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${conf.className}`}>{conf.label}</span>
      </div>

      <p className="mt-3 text-3xl font-bold tabular-nums text-ts-text-primary">
        {money ? '€' : ''}
        {compact(e.mid)}
      </p>
      <p className="text-xs text-ts-text-secondary">{e.unit}</p>

      <div className="mt-3" aria-label={`Range ${compact(e.low)} to ${compact(e.high)}`}>
        <div className="relative h-1.5 rounded-full bg-gradient-to-r from-ts-border via-adobe-red/50 to-ts-border">
          <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ts-surface bg-adobe-red" style={{ left: `${midPct}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-ts-text-secondary">
          <span>{money ? '€' : ''}{compact(e.low)}</span>
          <span>{money ? '€' : ''}{compact(e.high)}</span>
        </div>
      </div>

      <p className="mt-3 text-xs text-ts-text-primary">
        <span className="text-ts-text-secondary">License metric: </span>
        {e.licenseUnit}
        {e.licenseUnits !== undefined && <span className="font-semibold"> · ≈ {e.licenseUnits.toLocaleString('en-US')} units</span>}
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {e.adobeInUse && <span className="rounded-full bg-adobe-red/15 px-2 py-0.5 text-[11px] font-medium text-ts-text-primary">Adobe in use</span>}
        {e.detected.map((d) => (
          <span key={d} className="rounded-full border border-ts-border px-2 py-0.5 text-[11px] text-ts-text-secondary">{d}</span>
        ))}
        {e.detected.length === 0 && <span className="text-[11px] text-ts-text-secondary">No tool detected in this category</span>}
      </div>

      <button
        type="button"
        className="mt-auto flex items-center gap-1 pt-3 text-xs font-medium text-ts-accent hover:underline"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        How we calculated
      </button>
      {open && (
        <div className="mt-2 space-y-3 border-t border-ts-border pt-3">
          <p className="text-xs text-ts-text-primary">{e.formula}</p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-ts-text-secondary">
            {e.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
          <div className="grid grid-cols-1 gap-2">
            {e.assumptionKeys.map((k) => (
              <AssumptionInput key={k} name={k} value={assumptions[k]} onChange={onChange} />
            ))}
          </div>
          <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-ts-accent hover:underline">
            Product Description <ExternalLink className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      )}
    </article>
  );
}

/** Indikatives Lizenz-Sizing (Server Calls, Profiles, Rows of Data …) aus den gemessenen Traffic-Daten. */
export default function LicenseSizingPanel({ analysis }: { analysis: AnalysisResult }) {
  const basis = useMemo(() => sizingBasis(analysis), [analysis]);
  const defaults = useMemo(() => defaultAssumptions(basis), [basis]);
  const key = storageKey(analysis);
  const [overrides, setOverrides] = useState<Partial<SizingAssumptions>>(() => loadOverrides(key));

  useEffect(() => {
    setOverrides(loadOverrides(key));
  }, [key]);

  const assumptions = useMemo<SizingAssumptions>(() => ({ ...defaults, ...overrides }), [defaults, overrides]);
  const estimates = useMemo(() => estimateLicenses(analysis, assumptions), [analysis, assumptions]);
  const edited = Object.keys(overrides).length > 0;

  const update = (name: keyof SizingAssumptions, value: number) => {
    setOverrides((prev) => {
      const next = { ...prev, [name]: value };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* Speicher voll/gesperrt: Änderung bleibt nur in der Sitzung */
      }
      return next;
    });
  };
  const reset = () => {
    setOverrides({});
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignorieren */
    }
  };

  const noTraffic = assumptions.monthlyVisits <= 0;

  return (
    <section id="section-license">
      <div className="bg-ts-surface-card rounded-2xl border border-ts-border overflow-hidden">
        <div className="bg-gradient-to-br from-adobe-red/10 via-ts-surface-card to-ts-accent/5 p-4 sm:p-6 border-b border-ts-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-ts-text-primary flex items-center gap-2">
                <Scale className="w-6 h-6 text-adobe-red" strokeWidth={1.5} />
                License Sizing
              </h2>
              <p className="mt-1 text-sm text-ts-text-secondary max-w-3xl">
                Indicative volumes for each Adobe license metric (server calls, page views, content requests, rows of data,
                profiles), derived from the measured traffic and the official Adobe Product Descriptions. Adjust any assumption –
                the estimates update instantly.
              </p>
            </div>
            {edited && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ts-border px-3 py-1.5 text-xs text-ts-text-secondary hover:text-ts-text-primary"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset assumptions
              </button>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-6">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ts-text-secondary">Sizing basis</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {BASE_KEYS.map((k) => (
                <AssumptionInput
                  key={k}
                  name={k}
                  value={assumptions[k]}
                  measured={overrides[k] === undefined && basis.measured[k as keyof typeof basis.measured] !== undefined}
                  onChange={update}
                />
              ))}
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-ts-text-secondary">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {basis.source === 'semrush'
                  ? `Traffic from Semrush${basis.displayDate ? ` (${basis.displayDate})` : ''}`
                  : 'No measured traffic yet – enter monthly visits or run the traffic enrichment'}
                {' · '}≈ {compact(pageViewsPerMonth(assumptions))} page views / month
                {basis.mobileApps > 0 && ` incl. app traffic (${basis.mobileApps} app${basis.mobileApps === 1 ? '' : 's'} found)`}
                {' · '}Known customers is a placeholder – replace it with the customer's real CRM size.
              </span>
            </p>
          </div>

          {noTraffic ? (
            <p className="rounded-xl border border-dashed border-ts-border p-6 text-center text-sm text-ts-text-secondary">
              Enter monthly visits above to calculate the license estimates.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 items-start gap-4">
              {estimates.map((e) => (
                <EstimateCard key={e.key} e={e} assumptions={assumptions} onChange={update} />
              ))}
            </div>
          )}

          <p className="text-[11px] text-ts-text-secondary">
            Indicative only, not a quote. Ranges reflect the confidence of the inputs. Contractual definitions and entitlements are
            in the linked Adobe Product Descriptions; validate volumes with the customer before pricing.
          </p>
        </div>
      </div>
    </section>
  );
}

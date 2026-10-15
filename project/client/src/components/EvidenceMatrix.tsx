import { useMemo, useState } from 'react';
import { Check, Info, ShieldCheck } from 'lucide-react';
import type {
  BuildingBlockAgreement,
  ConsensusStatus,
  EvidenceCell,
  EvidenceMatrix as EvidenceMatrixData,
} from '../types/parity';

const STATUS_META: Record<ConsensusStatus, { label: string; className: string }> = {
  confirmed: { label: 'Confirmed', className: 'bg-ts-success/10 text-ts-success border-ts-success/40' },
  'techstack-only': { label: 'TechStack only', className: 'bg-ts-warning/10 text-ts-warning border-ts-warning/40' },
  'observepoint-only': { label: 'ObservePoint only', className: 'bg-ts-warning/10 text-ts-warning border-ts-warning/40' },
  'not-comparable': {
    label: 'Not comparable',
    className: 'bg-ts-surface-light/30 text-ts-text-secondary border-ts-border',
  },
};

const VERDICT_META: Record<BuildingBlockAgreement['verdict'], { label: string; className: string }> = {
  agree: { label: 'Agreement', className: 'bg-ts-success/10 text-ts-success border-ts-success/40' },
  partial: { label: 'Partial', className: 'bg-ts-warning/10 text-ts-warning border-ts-warning/40' },
  conflict: { label: 'Conflict', className: 'bg-adobe-red/10 text-adobe-red border-adobe-red/30' },
  single: { label: 'Single source', className: 'bg-ts-surface-light/30 text-ts-text-secondary border-ts-border' },
};

const chip = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap';

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

function TechStackCell({ cell }: { cell?: EvidenceCell }) {
  if (!cell) return <span className="text-ts-text-secondary/50">–</span>;
  return (
    <div className="space-y-0.5">
      <div className="text-ts-text-primary">{cell.name}</div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ts-text-secondary">
        {/* TechStack-Konfidenz ist bereits 0–100, die Zeilen-Konfidenz 0–1. */}
        {cell.confidence != null && <span>Confidence {Math.round(cell.confidence)}%</span>}
        {cell.weak && (
          <span className={`${chip} bg-ts-warning/10 text-ts-warning border-ts-warning/30`} title="Weak detection (single signal)">
            weak
          </span>
        )}
      </div>
    </div>
  );
}

function ObservePointCell({ cell }: { cell?: EvidenceCell }) {
  if (!cell) return <span className="text-ts-text-secondary/50">–</span>;
  return (
    <div className="space-y-1">
      <div className="text-ts-text-primary">{cell.name}</div>
      {cell.pagesPresent != null && (
        <div className="text-[11px] text-ts-text-secondary">
          on {cell.pagesPresent}
          {cell.pagesScanned != null ? ` / ${cell.pagesScanned}` : ''} {cell.pagesScanned === 1 ? 'page' : 'pages'}
        </div>
      )}
      {!!cell.accounts?.length && (
        <div className="flex flex-wrap gap-1">
          {cell.accounts.map((a) => (
            <span key={a} className={`${chip} bg-ts-surface-light/30 text-ts-text-secondary border-ts-border font-mono`}>
              {a}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value));
  const color = v >= 0.8 ? 'bg-ts-success' : v >= 0.5 ? 'bg-ts-warning' : 'bg-ts-text-secondary/50';
  return (
    <div className="flex items-center gap-2 min-w-[96px]">
      <div className="h-1.5 flex-1 rounded-full bg-ts-border overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${v * 100}%` }} aria-hidden="true" />
      </div>
      <span className="text-[11px] tabular-nums text-ts-text-secondary w-9 text-right">{pct(v)}</span>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex items-center gap-2 py-1 text-xs text-ts-text-secondary cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-adobe-red w-4 h-4"
      />
      {label}
    </label>
  );
}

export default function EvidenceMatrix({ matrix }: { matrix: EvidenceMatrixData }) {
  const [onlyDiffs, setOnlyDiffs] = useState(false);
  const [hideNotComparable, setHideNotComparable] = useState(true);
  const { stats } = matrix;

  const rows = useMemo(
    () =>
      matrix.rows.filter((r) => {
        if (onlyDiffs) return r.status === 'techstack-only' || r.status === 'observepoint-only';
        if (hideNotComparable) return r.status !== 'not-comparable';
        return true;
      }),
    [matrix.rows, onlyDiffs, hideNotComparable],
  );

  const kpis: Array<{ status: ConsensusStatus; value: number }> = [
    { status: 'confirmed', value: stats.confirmed },
    { status: 'techstack-only', value: stats.techstackOnly },
    { status: 'observepoint-only', value: stats.observepointOnly },
    { status: 'not-comparable', value: stats.notComparable },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)] items-stretch">
        <div className="min-w-0 rounded-xl border border-ts-border bg-ts-surface-light/30 p-4">
          <div className="text-xs text-ts-text-secondary">Agreement rate</div>
          <div className="mt-1 text-3xl font-semibold text-ts-text-primary tabular-nums">
            {stats.agreementRate == null ? '–' : `${Math.round(stats.agreementRate)}%`}
          </div>
          <div className="mt-1 text-xs text-ts-text-secondary">
            {stats.confirmed} of {stats.comparable} comparable technologies confirmed
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-3">
          {kpis.map((k) => (
            <div key={k.status} className="min-w-0 rounded-xl border border-ts-border p-3 flex flex-col justify-between gap-2">
              <span className={`${chip} self-start max-w-full whitespace-normal ${STATUS_META[k.status].className}`}>{STATUS_META[k.status].label}</span>
              <span className="text-2xl font-semibold text-ts-text-primary tabular-nums">{k.value}</span>
            </div>
          ))}
        </div>
      </div>

      {matrix.sources.length > 0 && (
        <p className="text-xs text-ts-text-secondary break-words">
          Sources:{' '}
          {matrix.sources.map((s, i) => (
            <span key={s.id}>
              {i > 0 && ' · '}
              <span className={s.available ? 'text-ts-text-primary' : 'line-through'}>{s.label}</span>
              {s.detail ? ` (${s.detail})` : ''}
            </span>
          ))}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Toggle checked={onlyDiffs} onChange={setOnlyDiffs} label="Differences only" />
        <Toggle
          checked={hideNotComparable}
          onChange={setHideNotComparable}
          label="Hide not comparable"
        />
        <span className="text-xs text-ts-text-secondary ml-auto" aria-live="polite">
          {rows.length} of {matrix.rows.length} rows
        </span>
      </div>

      <p className="text-[11px] text-ts-text-secondary md:hidden">Swipe horizontally to see all columns →</p>
      <div className="overflow-x-auto rounded-xl border border-ts-border">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">Evidence matrix: TechStack vs. ObservePoint per technology</caption>
          <thead className="bg-ts-surface-light/30 text-xs text-ts-text-secondary text-left">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Technology</th>
              <th scope="col" className="px-3 py-2 font-medium">Building block</th>
              <th scope="col" className="px-3 py-2 font-medium">TechStack</th>
              <th scope="col" className="px-3 py-2 font-medium">ObservePoint</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-xs text-ts-text-secondary">
                  No rows match the current filter.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.key}
                className={`border-t border-ts-border/50 align-top ${r.isAdobe ? 'bg-adobe-red/[0.04]' : ''}`}
              >
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`font-medium text-ts-text-primary ${r.isAdobe ? 'border-l-2 border-adobe-red pl-1.5' : ''}`}>
                      {r.technology}
                    </span>
                    {r.upgradedFromWeak && (
                      <span className={`${chip} bg-ts-success/10 text-ts-success border-ts-success/40`}>
                        <ShieldCheck className="w-3 h-3" /> confirmed by OP
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-ts-text-secondary">{r.buildingBlock ?? '–'}</td>
                <td className="px-3 py-2.5">
                  <TechStackCell cell={r.sources.techstack} />
                </td>
                <td className="px-3 py-2.5">
                  <ObservePointCell cell={r.sources.observepoint} />
                </td>
                <td className="px-3 py-2.5">
                  <span className={`${chip} ${STATUS_META[r.status].className}`}>
                    {r.status === 'confirmed' && <Check className="w-3 h-3" />}
                    {STATUS_META[r.status].label}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <ConfidenceBar value={r.confidence} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-ts-text-secondary flex items-start gap-2">
        <Info className="w-4 h-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <span>
          <strong className="font-medium text-ts-text-primary">Not comparable</strong> means one of the two sources
          fundamentally cannot detect this technology (e.g. CMS or hosting for ObservePoint, server-side tags for
          TechStack). This is not a conflict and is excluded from the agreement rate.
        </span>
      </p>

      {matrix.blocks.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ts-text-primary">Comparison per building block</h3>
          <ul className="divide-y divide-ts-border/50 rounded-xl border border-ts-border">
            {matrix.blocks.map((b) => (
              <li key={b.buildingBlock} className="px-3 py-2.5 grid gap-2 md:grid-cols-[180px_1fr_1fr_auto] md:items-center text-xs">
                <span className="font-medium text-ts-text-primary">{b.buildingBlock}</span>
                <span className="text-ts-text-secondary">
                  <span className="text-ts-text-secondary/80">TechStack: </span>
                  {b.techstack.length ? b.techstack.join(', ') : '–'}
                </span>
                <span className="text-ts-text-secondary">
                  <span className="text-ts-text-secondary/80">ObservePoint: </span>
                  {b.observepoint.length ? b.observepoint.join(', ') : '–'}
                </span>
                <span className={`${chip} justify-self-start ${VERDICT_META[b.verdict].className}`}>
                  {VERDICT_META[b.verdict].label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

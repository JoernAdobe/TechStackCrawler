import type { ReactNode } from 'react';
import type { AccountView } from '../types/batchAccount';

import { card, scoreClass, td, th } from '../lib/accountDashboardStyles';

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3">
        <h4 className="text-sm font-semibold text-ts-text-primary">{title}</h4>
        {hint && <span className="text-xs text-ts-text-secondary">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export function Bar({ value, className = 'bg-ts-accent' }: { value: number; className?: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-ts-surface-light overflow-hidden">
      <div className={`h-full ${className}`} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}

const fmt = (v: number | null | undefined, suffix = '') => (v === null || v === undefined ? '—' : `${v}${suffix}`);
const compact = (v?: number) =>
  v === undefined ? '—' : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

/** Domains nach Traffic-Gewicht, Spalten nur für Quellen mit Daten. */
export function DomainsTable({ view, onOpenAnalysis }: { view: AccountView; onOpenAnalysis?: (id: number) => void }) {
  const c = view.coverage;
  const domains = [...view.domains].sort((a, b) => (b.trafficScore ?? -1) - (a.trafficScore ?? -1));
  return (
    <Section title="Domains by traffic weight" hint="Traffic score 0–100 from Tranco rank / Semrush visits">
      <div className="overflow-x-auto -mx-1">
        <table className="min-w-full text-xs">
          <thead className="bg-ts-surface-light">
            <tr>
              <th className={th}>Domain</th>
              {(c.traffic ?? 0) > 0 && <th className={`${th} min-w-[8rem]`}>Traffic</th>}
              {(c.semrush ?? 0) > 0 && <th className={th}>Visits/mo</th>}
              <th className={th}>Tech</th>
              <th className={th}>Adobe</th>
              {(c.lighthouse ?? 0) > 0 && <th className={th}>Mobile perf.</th>}
              {(c.geo ?? 0) > 0 && <th className={th}>GEO</th>}
              {(c.observepoint ?? 0) > 0 && <th className={th}>OP agreement</th>}
              {(c.mobileApps ?? 0) > 0 && <th className={th}>Apps</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-ts-border/60">
            {domains.map((d) => (
              <tr key={d.itemId}>
                <td className={`${td} max-w-[16rem]`}>
                  <div className="truncate text-ts-text-primary" title={d.url}>
                    {d.analysisId && onOpenAnalysis ? (
                      <button className="hover:text-ts-accent underline-offset-2 hover:underline" onClick={() => onOpenAnalysis(d.analysisId!)}>
                        {d.host}
                      </button>
                    ) : (
                      d.host
                    )}
                  </div>
                  {d.label && <div className="truncate text-ts-text-secondary">{d.label}</div>}
                </td>
                {(c.traffic ?? 0) > 0 && (
                  <td className={td}>
                    {d.trafficScore === null ? (
                      <span className="text-ts-text-secondary">unranked</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-16 shrink-0"><Bar value={d.trafficScore} /></div>
                        <span className="text-ts-text-primary tabular-nums">{d.trafficScore}</span>
                        {d.trancoRank && <span className="text-ts-text-secondary whitespace-nowrap">#{d.trancoRank.toLocaleString('en-US')}</span>}
                      </div>
                    )}
                  </td>
                )}
                {(c.semrush ?? 0) > 0 && <td className={`${td} tabular-nums`}>{compact(d.visits)}</td>}
                <td className={`${td} tabular-nums text-ts-text-primary`}>{d.techCount}</td>
                <td className={`${td} tabular-nums ${d.adobeCount ? 'text-adobe-red font-semibold' : 'text-ts-text-secondary'}`}>{d.adobeCount}</td>
                {(c.lighthouse ?? 0) > 0 && <td className={`${td} tabular-nums ${scoreClass(d.mobilePerformance, 90, 50)}`}>{fmt(d.mobilePerformance)}</td>}
                {(c.geo ?? 0) > 0 && <td className={`${td} tabular-nums ${scoreClass(d.geoScore, 70, 40)}`}>{fmt(d.geoScore)}</td>}
                {(c.observepoint ?? 0) > 0 && (
                  <td className={`${td} tabular-nums ${scoreClass(d.opAgreement === null || d.opAgreement === undefined ? null : d.opAgreement, 80, 60)}`}>
                    {d.opAgreement === null || d.opAgreement === undefined ? '—' : `${Math.round(d.opAgreement)}%`}
                  </td>
                )}
                {(c.mobileApps ?? 0) > 0 && <td className={`${td} tabular-nums`}>{fmt(d.mobileApps)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/** Domain × Technologie (nur starke Erkennungen), sticky erste Spalte. */
export function TechMatrixTable({ view }: { view: AccountView }) {
  if (view.techMatrix.length === 0) return null;
  return (
    <Section title="Tech matrix" hint={`${view.techMatrix.length} technologies × ${view.domains.length} domains`}>
      <div className="overflow-auto max-h-[28rem] rounded-xl border border-ts-border">
        <table className="min-w-full text-xs border-collapse">
          <thead className="sticky top-0 z-20 bg-ts-surface-light">
            <tr>
              <th className={`${th} sticky left-0 z-30 bg-ts-surface-light min-w-[10rem] max-w-[14rem]`}>Technology</th>
              <th className={th}>Block</th>
              <th className={th}>#</th>
              {view.domains.map((d) => (
                <th key={d.itemId} className={`${th} max-w-[8rem]`} title={d.url}>
                  <div className="truncate">{d.label || d.host}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.techMatrix.map((t) => (
              <tr key={t.technology} className="border-t border-ts-border/60">
                <th className="sticky left-0 z-10 bg-ts-surface-card text-left px-3 py-1.5 font-normal max-w-[14rem]">
                  <div className={`truncate ${t.isAdobe ? 'text-adobe-red font-medium' : 'text-ts-text-primary'}`} title={t.technology}>
                    {t.technology}
                  </div>
                </th>
                <td className="px-3 py-1.5 text-ts-text-secondary whitespace-nowrap">{t.buildingBlock ?? 'Other'}</td>
                <td className="px-3 py-1.5 tabular-nums text-ts-text-secondary">{t.count}</td>
                {t.presence.map((p, i) => (
                  <td key={i} className="px-3 py-1.5 text-center">
                    {p ? (
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${t.isAdobe ? 'bg-adobe-red' : 'bg-ts-accent'}`} aria-label="present" />
                    ) : (
                      <span className="text-ts-border">·</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

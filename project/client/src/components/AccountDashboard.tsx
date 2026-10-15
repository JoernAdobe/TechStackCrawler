import { AlertTriangle, Gauge, Layers, ShieldAlert, Sparkles, Target } from 'lucide-react';
import type { AccountView } from '../types/batchAccount';
import { Bar, DomainsTable, Section, TechMatrixTable } from './AccountDashboardTables';
import { card, scoreClass, td, th } from '../lib/accountDashboardStyles';

const FOOTPRINT_STYLE: Record<string, string> = {
  adobe: 'border-ts-success/40 bg-ts-success/10',
  mixed: 'border-ts-warning/40 bg-ts-warning/10',
  competitor: 'border-adobe-red/40 bg-adobe-red/10',
  none: 'border-ts-border bg-ts-surface-light/40',
};
const FOOTPRINT_LABEL: Record<string, string> = { adobe: 'Adobe', mixed: 'Mixed', competitor: 'Competitor', none: 'Not detected' };
const SEVERITY_STYLE: Record<string, string> = {
  high: 'text-adobe-red border-adobe-red/40 bg-adobe-red/10',
  medium: 'text-ts-warning border-ts-warning/40 bg-ts-warning/10',
  low: 'text-ts-text-secondary border-ts-border bg-ts-surface-light',
};
const GAP_LABEL: Record<string, string> = { competitor: 'Displacement', fragmented: 'Consolidation', 'none-detected': 'Greenfield' };
const SOURCE_LABEL: Record<string, string> = {
  traffic: 'Tranco',
  semrush: 'Semrush',
  observepoint: 'ObservePoint',
  mobileApps: 'Mobile apps',
  lighthouse: 'Lighthouse',
  geo: 'GEO',
  useCases: 'Use cases',
};

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="min-w-0 p-3 rounded-xl border border-ts-border bg-ts-surface-light/40">
      <div className="text-xs text-ts-text-secondary truncate">{label}</div>
      <div className="text-xl font-semibold text-ts-text-primary tabular-nums">{value}</div>
      {sub && <div className="text-xs text-ts-text-secondary truncate" title={sub}>{sub}</div>}
    </div>
  );
}

const chips = (items: string[], max = 4) => (items.length > max ? `${items.slice(0, max).join(', ')} +${items.length - max}` : items.join(', '));

export default function AccountDashboard({ view, onOpenAnalysis }: { view: AccountView; onOpenAnalysis?: (id: number) => void }) {
  const n = view.domains.length;
  const blocksSeen = view.footprint.filter((f) => f.status !== 'none');
  const adobeBlocks = view.footprint.filter((f) => f.status === 'adobe' || f.status === 'mixed').length;
  const highFindings = view.findings.filter((f) => f.severity === 'high').length;
  const sources = Object.entries(view.coverage).filter(([k, v]) => k !== 'detections' && (v ?? 0) > 0);

  return (
    <div className="space-y-4 min-w-0">
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-ts-text-primary">
            <Layers className="w-4 h-4 text-adobe-red" /> Account view
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {sources.map(([k, v]) => (
              <span key={k} className="px-2 py-0.5 text-[11px] rounded-full border border-ts-border text-ts-text-secondary whitespace-nowrap">
                {SOURCE_LABEL[k] ?? k} {v}/{n}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Kpi label="Domains analysed" value={n} />
          <Kpi label="Distinct technologies" value={view.techMatrix.length} sub={`${view.techMatrix.filter((t) => t.isAdobe).length} Adobe`} />
          <Kpi label="Adobe in building blocks" value={`${adobeBlocks}/${blocksSeen.length}`} sub="blocks with any detection" />
          <Kpi label="Fragmented blocks" value={view.fragmentation.length} sub={chips(view.fragmentation.map((f) => f.buildingBlock), 2)} />
          <Kpi label="High-severity findings" value={highFindings} sub={`${view.findings.length} findings total`} />
        </div>
        {view.sourceIssues.length > 0 && (
          <ul className="mt-3 space-y-0.5 text-xs text-ts-text-secondary">
            {view.sourceIssues.map((s) => (
              <li key={s.source} className="flex items-start gap-1.5 min-w-0">
                <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0 text-ts-warning" />
                <span className="min-w-0 break-words">
                  {SOURCE_LABEL[s.source] ?? s.source}: {s.errors > 0 && `${s.errors} error(s)`}
                  {s.errors > 0 && s.skipped > 0 && ', '}
                  {s.skipped > 0 && `${s.skipped} skipped`}
                  {s.sample && ` – ${s.sample}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {view.opportunities.length > 0 && (
        <Section title="Top account opportunities" hint="Priority = traffic weight × Adobe gap across domains">
          <ol className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {view.opportunities.map((o, i) => (
              <li key={o.buildingBlock} className="min-w-0 p-3 rounded-xl border border-ts-border bg-ts-surface-light/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-ts-text-primary">
                      <Target className="w-3.5 h-3.5 shrink-0 text-adobe-red" />
                      <span className="truncate">{i + 1}. {o.adobeProduct}</span>
                    </div>
                    <div className="text-xs text-ts-text-secondary truncate">
                      {o.buildingBlock} · {GAP_LABEL[o.gap]}{o.competitors.length > 0 && ` · vs. ${chips(o.competitors, 3)}`}
                    </div>
                  </div>
                  <span className={`shrink-0 text-lg font-semibold tabular-nums ${scoreClass(o.score, 50, 20)}`}>{o.score}</span>
                </div>
                <div className="mt-2"><Bar value={o.score} className="bg-adobe-red" /></div>
                <p className="mt-2 text-xs text-ts-text-secondary line-clamp-3">{o.rationale}</p>
                <p className="mt-1 text-[11px] text-ts-text-secondary truncate" title={o.domains.join(', ')}>Domains: {chips(o.domains)}</p>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <DomainsTable view={view} onOpenAnalysis={onOpenAnalysis} />

      {blocksSeen.length > 0 && (
        <Section title="Adobe footprint vs. competition" hint="Per building block, across all domains">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {view.footprint.map((f) => (
              <div key={f.buildingBlock} className={`min-w-0 p-3 rounded-xl border ${FOOTPRINT_STYLE[f.status]}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ts-text-primary truncate">{f.buildingBlock}</span>
                  <span className="text-[11px] text-ts-text-secondary whitespace-nowrap">{FOOTPRINT_LABEL[f.status]}</span>
                </div>
                {f.adobe.length > 0 && (
                  <p className="text-xs text-adobe-red truncate" title={f.adobe.join(', ')}>Adobe ({f.adobeDomains}/{n}): {chips(f.adobe, 3)}</p>
                )}
                {f.competitors.length > 0 && (
                  <p className="text-xs text-ts-text-secondary truncate" title={f.competitors.join(', ')}>
                    Others ({f.competitorDomains}/{n}): {chips(f.competitors, 3)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {view.fragmentation.length > 0 && (
        <Section title="Fragmentation" hint="Building blocks with two or more different solutions in the account">
          <ul className="space-y-2">
            {view.fragmentation.map((f) => (
              <li key={f.buildingBlock} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 min-w-0">
                <span className="sm:w-48 shrink-0 text-sm text-ts-text-primary">
                  {f.buildingBlock} <span className="text-xs text-ts-warning">({f.solutions.length})</span>
                </span>
                <span className="flex flex-wrap gap-1.5 min-w-0">
                  {f.solutions.map((s) => (
                    <span key={s.name} className={`px-2 py-0.5 text-xs rounded-full border max-w-full truncate ${s.isAdobe ? 'border-adobe-red/40 text-adobe-red' : 'border-ts-border text-ts-text-secondary'}`}>
                      {s.name} · {s.domains}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <TechMatrixTable view={view} />

      {(view.performanceRanking.length > 0 || view.geoRanking.length > 0) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {view.performanceRanking.length > 0 && (
            <Section title="Performance ranking (Lighthouse)" hint="Worst mobile score first">
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-ts-surface-light"><tr><th className={th}>Domain</th><th className={th}>Mobile</th><th className={th}>Desktop</th><th className={th}>LCP</th><th className={th}>CLS</th></tr></thead>
                  <tbody className="divide-y divide-ts-border/60">
                    {view.performanceRanking.map((p) => (
                      <tr key={p.host}>
                        <td className={`${td} max-w-[12rem] truncate text-ts-text-primary`}>{p.host}</td>
                        <td className={`${td} tabular-nums ${scoreClass(p.mobile, 90, 50)}`}>{p.mobile ?? '—'}</td>
                        <td className={`${td} tabular-nums ${scoreClass(p.desktop, 90, 50)}`}>{p.desktop ?? '—'}</td>
                        <td className={`${td} tabular-nums`}>{p.lcpMs !== undefined ? `${(p.lcpMs / 1000).toFixed(1)} s` : '—'}</td>
                        <td className={`${td} tabular-nums`}>{p.cls ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
          {view.geoRanking.length > 0 && (
            <Section title="GEO score ranking" hint="AI visibility of the brand">
              <ul className="space-y-2">
                {view.geoRanking.map((g) => (
                  <li key={g.host} className="min-w-0">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-ts-text-primary">{g.brand} <span className="text-ts-text-secondary">· {g.host}</span></span>
                      <span className={`tabular-nums font-semibold ${scoreClass(g.geoScore, 70, 40)}`}>{g.geoScore}</span>
                    </div>
                    <Bar value={g.geoScore} className="bg-ts-accent" />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}

      {view.observepoint.length > 0 && (
        <Section title="ObservePoint agreement per domain" hint="Existing audits only (read-only)">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-ts-surface-light">
                <tr><th className={th}>Domain</th><th className={th}>Audit</th><th className={th}>Agreement</th><th className={th}>Confirmed</th><th className={th}>TechStack only</th><th className={th}>OP only</th><th className={th}>Conflicts</th></tr>
              </thead>
              <tbody className="divide-y divide-ts-border/60">
                {view.observepoint.map((o) => (
                  <tr key={o.host}>
                    <td className={`${td} max-w-[12rem] truncate text-ts-text-primary`}>{o.host}</td>
                    <td className={`${td} whitespace-nowrap text-ts-text-secondary`}>{o.status === 'not_found' ? 'no audit' : o.status}{o.pagesScanned ? ` · ${o.pagesScanned} pages` : ''}</td>
                    <td className={`${td} tabular-nums ${scoreClass(o.agreementRate === null ? null : o.agreementRate, 80, 60)}`}>{o.agreementRate === null ? '—' : `${Math.round(o.agreementRate)}%`}</td>
                    <td className={`${td} tabular-nums`}>{o.status === 'done' ? o.confirmed : '—'}</td>
                    <td className={`${td} tabular-nums`}>{o.status === 'done' ? o.techstackOnly : '—'}</td>
                    <td className={`${td} tabular-nums`}>{o.status === 'done' ? o.observepointOnly : '—'}</td>
                    <td className={`${td} max-w-[14rem] truncate text-ts-text-secondary`} title={o.conflicts.join(', ')}>{o.conflicts.join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {view.findings.length > 0 && (
        <Section title="Privacy & technical findings" hint="Aggregated across domains">
          <ul className="space-y-2">
            {view.findings.map((f) => (
              <li key={f.key} className="flex items-start gap-2 min-w-0">
                <span className={`shrink-0 px-1.5 py-0.5 text-[10px] uppercase rounded border ${SEVERITY_STYLE[f.severity]}`}>{f.severity}</span>
                {f.kind === 'privacy' ? <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-ts-text-secondary" /> : <Gauge className="w-3.5 h-3.5 mt-0.5 shrink-0 text-ts-text-secondary" />}
                <div className="min-w-0">
                  <p className="text-sm text-ts-text-primary break-words">{f.title}</p>
                  <p className="text-xs text-ts-text-secondary truncate" title={f.domains.join(', ')}>
                    {f.domains.length}/{n} domains · {chips(f.domains, 3)} · {f.source}
                  </p>
                  {f.detail && <p className="text-xs text-ts-text-secondary line-clamp-2">{f.detail}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {view.useCases.length > 0 && (
        <Section title="Account use cases" hint="Merged across domains, priority = traffic × impact">
          <ul className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {view.useCases.map((u) => (
              <li key={u.title} className="min-w-0 p-3 rounded-xl border border-ts-border bg-ts-surface-light/40">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-1.5 min-w-0 text-sm text-ts-text-primary">
                    <Sparkles className="w-3.5 h-3.5 shrink-0 text-adobe-red" />
                    <span className="truncate" title={u.title}>{u.title}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-ts-text-primary">{u.score}</span>
                </div>
                <p className="text-xs text-ts-text-secondary truncate">{chips(u.adobeProducts, 3)} · {chips(u.domains, 3)}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

import type { ReactNode } from 'react';
import { Gauge, Info, Layers, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import type { ObservePointInsights as Insights, OpFindingSeverity } from '../types/parity';

const SEVERITY_STYLE: Record<OpFindingSeverity, string> = {
  high: 'text-adobe-red bg-adobe-red/10 border-adobe-red/30',
  medium: 'text-ts-warning bg-ts-warning/10 border-ts-warning/30',
  low: 'text-ts-text-secondary bg-ts-surface-light/60 border-ts-border',
};
const RATING_STYLE = { good: 'text-ts-success', 'needs-improvement': 'text-ts-warning', poor: 'text-adobe-red' } as const;

function formatDay(iso?: string) {
  if (!iso) return 'unknown date';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { dateStyle: 'medium' });
}

function SeverityBadge({ severity }: { severity: OpFindingSeverity }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_STYLE[severity]}`}>
      {severity}
    </span>
  );
}

function Block({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-ts-border bg-ts-surface-light/30 p-4 min-w-0">
      <h4 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-ts-text-primary">
        {icon}
        {title}
      </h4>
      <div className="space-y-2 text-xs text-ts-text-secondary">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 min-w-0">
      <dt className="w-28 shrink-0 text-ts-text-secondary">{label}</dt>
      <dd className="min-w-0 break-words text-ts-text-primary">{children}</dd>
    </div>
  );
}

const iconCls = 'w-4 h-4 text-ts-accent shrink-0';

export default function ObservePointInsights({ insights }: { insights: Insights }) {
  const { versions, adobeFootprint: fp, quality: q, privacy: p, findings } = insights;
  const pages = insights.pages;
  const hasQuality =
    q && (q.brokenTags.length || q.duplicateTags.length || q.slowTags.length || q.consoleMessages.length || q.webVitals || q.consoleErrorCount);
  const nothing = !versions && !fp && !hasQuality && !p && !findings.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-ts-text-primary">Implementation Insights</h3>
        <p className="text-[11px] text-ts-text-secondary flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          Data from OP run {formatDay(insights.runCompletedAt)}, {pages ?? '?'} {pages === 1 ? 'page' : 'pages'}
          {insights.consentAccepted !== false ? ', consent banner may have been accepted' : ''}.
        </p>
      </div>

      {nothing && <p className="text-xs text-ts-text-secondary">No insight data available for this run.</p>}

      {findings.length > 0 && (
        <div className="rounded-xl border border-ts-border p-4">
          <h4 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-ts-text-primary">
            <TriangleAlert className={iconCls} strokeWidth={1.5} aria-hidden="true" />
            Findings for use cases ({findings.length})
          </h4>
          <ul className="divide-y divide-ts-border/50">
            {findings.map((f) => (
              <li key={f.id} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-start gap-2">
                  <SeverityBadge severity={f.severity} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ts-text-primary">
                      {f.title}
                      <span className="ml-1.5 font-normal text-ts-text-secondary">· {f.type}</span>
                    </p>
                    <p className="text-[11px] text-ts-text-secondary break-words">{f.evidence}</p>
                    <p className="mt-0.5 text-[11px] text-ts-text-primary/90 flex items-start gap-1">
                      <Sparkles className="w-3 h-3 text-adobe-red shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{f.adobeAngle}</span>
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {fp && (
          <Block icon={<Layers className={iconCls} strokeWidth={1.5} aria-hidden="true" />} title="Adobe footprint">
            <dl className="space-y-1">
              {fp.imsOrgIds.length > 0 && <Row label="IMS Org">{fp.imsOrgIds.join(', ')}</Row>}
              {fp.reportSuites.length > 0 && <Row label="Report suite(s)">{fp.reportSuites.join(', ')}</Row>}
              {fp.trackingServers.length > 0 && <Row label="Tracking server">{fp.trackingServers.join(', ')}</Row>}
              {fp.targetClientCodes.length > 0 && <Row label="Target client">{fp.targetClientCodes.join(', ')}</Row>}
              {fp.launch && (
                <Row label="Tags property">
                  {fp.launch.propertyName ?? fp.launch.propertyId}
                  {fp.launch.environment ? ` · ${fp.launch.environment}` : ''}
                  {fp.launch.buildDate ? ` · built ${formatDay(fp.launch.buildDate)}` : ''}
                </Row>
              )}
              {!!(fp.evarCount || fp.propCount) && (
                <Row label="Variables">
                  {fp.evarCount ?? 0} eVars · {fp.propCount ?? 0} props (sampled page)
                </Row>
              )}
              <Row label="Collection">
                {fp.webSdk ? 'Web SDK' : fp.appMeasurement ? 'AppMeasurement (legacy)' : '–'}
              </Row>
            </dl>
          </Block>
        )}

        {versions && (versions.tags.length > 0 || versions.upgrades.length > 0) && (
          <Block icon={<Sparkles className={iconCls} strokeWidth={1.5} aria-hidden="true" />} title="Versions & upgrade opportunities">
            {versions.tags.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {versions.tags.slice(0, 12).map((v) => (
                  <li key={`${v.tag}|${v.version}`} className="rounded-md border border-ts-border bg-ts-surface-card px-2 py-0.5">
                    <span className="text-ts-text-primary">{v.tag}</span> <span className="font-mono">{v.version}</span>
                  </li>
                ))}
              </ul>
            )}
            {versions.upgrades.map((u) => (
              <p key={u.id} className="flex items-start gap-2">
                <SeverityBadge severity={u.severity} />
                <span>
                  <span className="font-semibold text-ts-text-primary">{u.title}:</span> {u.recommendation}
                </span>
              </p>
            ))}
          </Block>
        )}

        {q && !!hasQuality && (
          <Block icon={<Gauge className={iconCls} strokeWidth={1.5} aria-hidden="true" />} title="Quality">
            {q.webVitals && (
              <p className="flex flex-wrap gap-x-3 gap-y-1">
                {(
                  [
                    ['LCP', q.webVitals.lcpMs, 'lcp', 'ms'],
                    ['FCP', q.webVitals.fcpMs, 'fcp', 'ms'],
                    ['TTFB', q.webVitals.ttfbMs, 'ttfb', 'ms'],
                    ['CLS', q.webVitals.cls, 'cls', ''],
                  ] as const
                ).map(([label, value, key, unit]) =>
                  value === undefined ? null : (
                    <span key={label}>
                      {label}{' '}
                      <span className={`font-semibold ${RATING_STYLE[q.webVitals!.ratings[key] ?? 'good']}`}>
                        {unit ? `${Math.round(value)} ${unit}` : value.toFixed(3)}
                      </span>
                    </span>
                  ),
                )}
                {q.avgPageLoadMs !== undefined && <span>Avg. load {Math.round(q.avgPageLoadMs)} ms</span>}
              </p>
            )}
            {q.brokenTags.length > 0 && (
              <p>
                <span className="font-semibold text-ts-text-primary">Broken tags:</span>{' '}
                {q.brokenTags.map((t) => `${t.name} (${t.instances})`).join(', ')}
              </p>
            )}
            {q.duplicateTags.length > 0 && (
              <p>
                <span className="font-semibold text-ts-text-primary">Duplicate firing:</span>{' '}
                {q.duplicateTags.map((t) => `${t.name} (${t.duplicates}×)`).join(', ')}
              </p>
            )}
            {q.slowTags.length > 0 ? (
              <p>
                <span className="font-semibold text-ts-text-primary">Slow tags:</span>{' '}
                {q.slowTags.slice(0, 5).map((t) => `${t.name}${t.medianMs !== undefined ? ` (${Math.round(t.medianMs)} ms)` : ` (${t.slowInstances} slow)`}`).join(', ')}
              </p>
            ) : (
              q.slowestTags.length > 0 && (
                <p>
                  <span className="font-semibold text-ts-text-primary">Slowest tags (median):</span>{' '}
                  {q.slowestTags.slice(0, 3).map((t) => `${t.name} ${Math.round(t.medianMs)} ms`).join(', ')}
                </p>
              )
            )}
            {(q.consoleErrorCount !== undefined || q.consoleWarnCount !== undefined) && (
              <p>
                <span className="font-semibold text-ts-text-primary">Console:</span> {q.consoleErrorCount ?? 0} error{q.consoleErrorCount === 1 ? '' : 's'} ·{' '}
                {q.consoleWarnCount ?? 0} warning{q.consoleWarnCount === 1 ? '' : 's'}
              </p>
            )}
            {q.consoleMessages.length > 0 && (
              <ul className="space-y-1">
                {q.consoleMessages.map((m, i) => (
                  <li key={i} className="font-mono text-[10.5px] break-words">
                    <span className={m.level === 'error' ? 'text-adobe-red' : 'text-ts-warning'}>{m.level}</span> {m.message}
                    {m.pages > 1 ? ` (${m.pages} pages)` : ''}
                  </li>
                ))}
              </ul>
            )}
          </Block>
        )}

        {p && (
          <Block icon={<ShieldCheck className={iconCls} strokeWidth={1.5} aria-hidden="true" />} title="Privacy">
            <dl className="space-y-1">
              <Row label="Cookies">
                {p.cookies.total} total · {p.cookies.firstParty} 1st-party · {p.cookies.thirdParty} 3rd-party
                {p.cookies.longLived ? ` · ${p.cookies.longLived} > 13 months` : ''}
              </Row>
              <Row label="Consent tool">
                {p.consentTool ? `${p.consentTool.name}${p.consentTool.version ? ` ${p.consentTool.version}` : ''}` : 'none detected'}
              </Row>
              {p.googleConsentMode && (
                <Row label="Google Consent Mode">
                  {p.googleConsentMode.detected
                    ? `detected${p.googleConsentMode.gcs ? ` (gcs ${p.googleConsentMode.gcs})` : ''}`
                    : 'not detected'}
                </Row>
              )}
              {p.requests && (
                <Row label="Non-EU requests">
                  {p.requests.nonEu} of {p.requests.total}
                  {p.requests.countries.length > 0 &&
                    ` · ${p.requests.countries.slice(0, 4).map((c) => `${c.code} ${c.count}`).join(', ')}`}
                </Row>
              )}
              {p.requests && p.requests.topNonEuHosts.length > 0 && (
                <Row label="Top non-EU hosts">{p.requests.topNonEuHosts.slice(0, 3).map((h) => h.host).join(', ')}</Row>
              )}
            </dl>
            {p.topCookies.some((c) => c.party === '3rd') && (
              <p>
                <span className="font-semibold text-ts-text-primary">3rd-party cookies:</span>{' '}
                {p.topCookies
                  .filter((c) => c.party === '3rd')
                  .map((c) => `${c.name} (${c.domain}${c.durationDays ? `, ${c.durationDays} d` : ''}${c.initiatorTags[0] ? `, via ${c.initiatorTags[0]}` : ''})`)
                  .join(', ')}
              </p>
            )}
          </Block>
        )}
      </div>

      {insights.notes.length > 0 && (
        <p className="text-[11px] text-ts-text-secondary">Partial data: {insights.notes.join(' · ')}</p>
      )}
    </div>
  );
}

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { TrafficResult } from '../types/parity';

const PIE_COLORS = ['#E8503A', '#D4A055', '#4ADE80', '#8B8FA0', '#A8ACBC', '#C73D2A'];

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

let regionNames: Intl.DisplayNames | null = null;
function countryName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-ts-border bg-ts-surface-light/30 px-3 py-2">
      <div className="text-[11px] text-ts-text-secondary">{label}</div>
      <div className="truncate text-sm font-semibold text-ts-text-primary" title={value}>
        {value}
      </div>
    </div>
  );
}

export default function TrafficPanel({ data }: { data: TrafficResult }) {
  const s = data.semrush;
  const deviceTotal = (s?.desktopVisits ?? 0) + (s?.mobileVisits ?? 0);
  const desktopPct = deviceTotal > 0 ? Math.round(((s?.desktopVisits ?? 0) / deviceTotal) * 100) : null;
  const countries = (s?.topCountries ?? []).map((c) => ({ ...c, name: countryName(c.country) }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Domain" value={data.domain} />
        <Stat
          label="Tranco global rank"
          value={data.trancoRank !== undefined ? `#${data.trancoRank.toLocaleString('en')}` : 'not ranked'}
        />
      </div>

      {s ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {s.visits !== undefined && <Stat label="Monthly visits" value={compact.format(s.visits)} />}
            {s.uniqueVisitors !== undefined && (
              <Stat label="Unique visitors" value={compact.format(s.uniqueVisitors)} />
            )}
            {s.bounceRatePct !== undefined && <Stat label="Bounce rate" value={`${s.bounceRatePct}%`} />}
            {s.pagesPerVisit !== undefined && <Stat label="Pages / visit" value={String(s.pagesPerVisit)} />}
            {s.avgVisitDurationSec !== undefined && (
              <Stat label="Avg. visit duration" value={formatDuration(s.avgVisitDurationSec)} />
            )}
          </div>

          {desktopPct !== null && (
            <div>
              <div className="flex justify-between text-[11px] text-ts-text-secondary mb-1">
                <span>Desktop {desktopPct}%</span>
                <span>Mobile {100 - desktopPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-ts-warning/60 overflow-hidden">
                <div className="h-full bg-adobe-red" style={{ width: `${desktopPct}%` }} />
              </div>
            </div>
          )}

          {countries.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ts-text-secondary mb-2">
                Top countries
              </h4>
              <div className="flex items-center gap-4">
                <div className="h-32 w-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={countries} dataKey="sharePct" nameKey="name" innerRadius={30} outerRadius={56}>
                        {countries.map((c, i) => (
                          <Cell key={c.country} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="#1A1A1E" />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) => `${v}%`}
                        contentStyle={{
                          backgroundColor: '#1A1A1E',
                          border: '1px solid #2A2A2F',
                          borderRadius: '8px',
                        }}
                        itemStyle={{ color: '#EDEDF0' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-1 text-sm min-w-0">
                  {countries.map((c, i) => (
                    <li key={c.country} className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="text-ts-text-primary truncate">{c.name}</span>
                      <span className="text-ts-text-secondary text-xs">{c.sharePct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {s.topPages.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ts-text-secondary mb-2">
                Top pages
              </h4>
              <ul className="space-y-1">
                {s.topPages.map((p) => (
                  <li key={p.page} className="flex justify-between gap-3 text-sm">
                    <span className="text-ts-text-primary truncate">{p.page}</span>
                    {p.trafficSharePct !== undefined && (
                      <span className="shrink-0 text-xs text-ts-text-secondary">{p.trafficSharePct}%</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-ts-text-secondary">
          Visit metrics require a Semrush API key on the server (SEMRUSH_API_KEY).
        </p>
      )}

      {data.notes && data.notes.length > 0 && (
        <ul className="space-y-0.5">
          {data.notes.map((n) => (
            <li key={n} className="text-[11px] text-ts-text-secondary">
              · {n}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-ts-text-secondary">
        Sources: {data.sources.length ? data.sources.join(', ') : 'none'}
        {s?.displayDate ? ` · Semrush month ${s.displayDate}` : ''} · {new Date(data.fetchedAt).toLocaleString()}
      </p>
    </div>
  );
}

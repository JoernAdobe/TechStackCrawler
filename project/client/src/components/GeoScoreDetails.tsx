import { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Info, Lightbulb } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { GeoScoreResult } from '../types/parity';

const COMPONENT_LABELS: Array<{ key: keyof GeoScoreResult['components']; label: string; hint: string }> = [
  { key: 'mentionFrequency', label: 'Mention Frequency', hint: 'How often the brand appears (50% of AI Visibility)' },
  { key: 'prominence', label: 'Position & Prominence', hint: 'How early in answers the brand appears (30%)' },
  { key: 'queryCoverage', label: 'Query Coverage', hint: 'Presence across funnel stages (20%)' },
  { key: 'sentiment', label: 'Sentiment', hint: 'Positive + ½ neutral mentions (informational)' },
  { key: 'competitorGap', label: 'Competitor Gap', hint: 'Brand mentions vs. strongest competitor (⅓ of GEO Score)' },
];

const POSITION_STYLES: Record<GeoScoreResult['marketPosition'], string> = {
  'Market Leader': 'bg-ts-success/15 text-ts-success border-ts-success/40',
  'Strong Position': 'bg-ts-accent/15 text-ts-accent-light border-ts-accent/40',
  Competitive: 'bg-ts-warning/15 text-ts-warning border-ts-warning/40',
  Challenged: 'bg-adobe-red/15 text-adobe-red border-adobe-red/40',
};

function scoreColor(v: number): string {
  if (v >= 70) return 'text-ts-success';
  if (v >= 40) return 'text-ts-warning';
  return 'text-adobe-red';
}

function barColor(v: number): string {
  if (v >= 70) return '#22c55e';
  if (v >= 40) return '#f59e0b';
  return '#eb1000';
}

function ScoreTile({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-ts-surface rounded-xl border border-ts-border p-5 flex flex-col">
      <span className="text-xs uppercase tracking-wide text-ts-text-secondary">{label}</span>
      <span className={`text-5xl font-bold mt-1 ${scoreColor(value)}`}>{Math.round(value)}</span>
      <span className="text-xs text-ts-text-secondary mt-1">{sub ?? 'of 100'}</span>
    </div>
  );
}

export default function GeoScoreDetails({ result }: { result: GeoScoreResult }) {
  const [openQueries, setOpenQueries] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const mentionedCount = result.queries.filter((q) => q.brandMentioned).length;

  return (
    <div className="space-y-6">
      {/* Header-Kennzahlen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ScoreTile label="GEO Score" value={result.geoScore} sub="AI Visibility ⅔ + Competitor Gap ⅓" />
        <ScoreTile label="AI Visibility" value={result.aiVisibility} />
        <div className="bg-ts-surface rounded-xl border border-ts-border p-5 flex flex-col">
          <span className="text-xs uppercase tracking-wide text-ts-text-secondary">Share of Voice</span>
          <span className="text-5xl font-bold mt-1 text-ts-text-primary">{Math.round(result.shareOfVoicePct)}%</span>
          <span className="text-xs text-ts-text-secondary mt-1">brand vs. all tracked mentions</span>
        </div>
        <div className="bg-ts-surface rounded-xl border border-ts-border p-5 flex flex-col">
          <span className="text-xs uppercase tracking-wide text-ts-text-secondary">Market Position</span>
          <span className={`mt-3 self-start px-3 py-1.5 rounded-full border text-sm font-semibold ${POSITION_STYLES[result.marketPosition]}`}>
            {result.marketPosition}
          </span>
          <span className="text-xs text-ts-text-secondary mt-auto pt-2">
            {result.brand} · {result.industry} · {result.country}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Komponenten */}
        <div className="bg-ts-surface rounded-xl border border-ts-border p-5">
          <h3 className="text-sm font-semibold text-ts-text-primary mb-4">Score Components</h3>
          <div className="space-y-3">
            {COMPONENT_LABELS.map(({ key, label, hint }) => {
              const v = result.components[key];
              return (
                <div key={key} title={hint}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-ts-text-secondary">{label}</span>
                    <span className={`font-semibold ${scoreColor(v)}`}>{Math.round(v)}</span>
                  </div>
                  <div className="h-2 bg-ts-surface-light rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, v))}%`, background: barColor(v) }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Funnel */}
        <div className="bg-ts-surface rounded-xl border border-ts-border p-5">
          <h3 className="text-sm font-semibold text-ts-text-primary mb-4">Visibility by Funnel Stage</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={result.funnel}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                <XAxis dataKey="stage" tick={{ fill: '#8888a0', fontSize: 11 }} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fill: '#8888a0', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 8, fontSize: 12 }}
                  formatter={(value, _name, item) => {
                    const p = (item as { payload?: { mentions: number; queries: number } }).payload;
                    return [`${String(value)}% (${p?.mentions ?? 0}/${p?.queries ?? 0} queries)`, 'Brand visibility'];
                  }}
                />
                <Bar dataKey="visibilityPct" radius={[4, 4, 0, 0]} name="Brand visibility">
                  {result.funnel.map((f) => (
                    <Cell key={f.stage} fill={barColor(f.visibilityPct)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Konkurrenten */}
      <div className="bg-ts-surface rounded-xl border border-ts-border p-5">
        <h3 className="text-sm font-semibold text-ts-text-primary mb-3">Brand vs. Competitors</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ts-text-secondary border-b border-ts-border">
              <th className="py-2 font-medium">Brand</th>
              <th className="py-2 font-medium">Domain</th>
              <th className="py-2 font-medium text-right">Mentions</th>
              <th className="py-2 font-medium text-right">Visibility</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-ts-border/50 font-semibold text-ts-text-primary">
              <td className="py-2">{result.brand}</td>
              <td className="py-2 text-ts-text-secondary font-normal">{result.domain}</td>
              <td className="py-2 text-right">{mentionedCount}</td>
              <td className="py-2 text-right">
                {result.queries.length ? Math.round((mentionedCount / result.queries.length) * 100) : 0}%
              </td>
            </tr>
            {result.competitors.map((c) => (
              <tr key={c.name} className="border-b border-ts-border/50 text-ts-text-primary">
                <td className="py-2">{c.name}</td>
                <td className="py-2 text-ts-text-secondary">{c.domain ?? '—'}</td>
                <td className="py-2 text-right">{c.mentions}</td>
                <td className="py-2 text-right">{Math.round(c.visibilityPct)}%</td>
              </tr>
            ))}
            {result.competitors.length === 0 && (
              <tr>
                <td colSpan={4} className="py-2 text-ts-text-secondary text-xs">No competitors tracked.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Empfehlungen */}
      {result.recommendations.length > 0 && (
        <div className="bg-ts-surface rounded-xl border border-ts-border p-5">
          <h3 className="text-sm font-semibold text-ts-text-primary mb-3 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-ts-warning" /> Recommendations
          </h3>
          <ol className="space-y-2 list-decimal list-inside text-sm text-ts-text-primary">
            {result.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Queries */}
      <div className="bg-ts-surface rounded-xl border border-ts-border">
        <button
          type="button"
          onClick={() => setOpenQueries((o) => !o)}
          className="w-full flex items-center justify-between p-5 text-sm font-semibold text-ts-text-primary"
        >
          <span className="flex items-center gap-2">
            {openQueries ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Tested Queries ({mentionedCount}/{result.queries.length} mention {result.brand})
          </span>
        </button>
        {openQueries && (
          <ul className="border-t border-ts-border divide-y divide-ts-border/50">
            {result.queries.map((q, i) => (
              <li key={i} className="px-5 py-3">
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  className="w-full flex items-start gap-3 text-left"
                >
                  {q.brandMentioned ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-ts-success" />
                  ) : (
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-ts-text-secondary" />
                  )}
                  <span className="flex-1 text-sm text-ts-text-primary">{q.query}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-ts-surface-light border border-ts-border text-ts-text-secondary shrink-0">
                    {q.stage}
                  </span>
                </button>
                {expanded === i && (
                  <div className="mt-2 ml-7 text-xs text-ts-text-secondary space-y-1">
                    {q.excerpt && <p className="italic text-ts-text-primary/80">“{q.excerpt}”</p>}
                    <p>
                      {q.brandMentioned
                        ? `Position: ${Math.round((q.firstPosition ?? 0) * 100)}% into answer · Sentiment: ${q.sentiment ?? 'Neutral'}`
                        : 'Brand not mentioned.'}
                    </p>
                    <p>Competitors mentioned: {q.competitorsMentioned.length ? q.competitorsMentioned.join(', ') : 'none'}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-ts-text-secondary flex gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          {result.methodologyNote} Model: {result.model} · {new Date(result.fetchedAt).toLocaleString()}
        </span>
      </p>
    </div>
  );
}

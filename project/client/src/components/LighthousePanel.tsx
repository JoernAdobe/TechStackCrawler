import { useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import type { LighthouseResult, LighthouseStrategyResult } from '../types/parity';

type Rating = 'good' | 'ni' | 'poor';

const RATING_CLASS: Record<Rating, string> = {
  good: 'text-ts-success',
  ni: 'text-ts-warning',
  poor: 'text-adobe-red',
};

const RATING_STROKE: Record<Rating, string> = {
  good: '#4ADE80',
  ni: '#D4A055',
  poor: '#E8503A',
};

function scoreRating(score: number): Rating {
  if (score >= 90) return 'good';
  if (score >= 50) return 'ni';
  return 'poor';
}

function metricRating(value: number, good: number, poor: number): Rating {
  if (value <= good) return 'good';
  if (value <= poor) return 'ni';
  return 'poor';
}

function ScoreCircle({ label, score }: { label: string; score: number | null }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const rating = score === null ? null : scoreRating(score);
  const offset = score === null ? circumference : circumference * (1 - score / 100);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative h-16 w-16">
        <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
          <circle cx="32" cy="32" r={radius} fill="none" stroke="#2A2A2F" strokeWidth="5" />
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke={rating ? RATING_STROKE[rating] : '#2A2A2F'}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <span
          className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${
            rating ? RATING_CLASS[rating] : 'text-ts-text-secondary'
          }`}
        >
          {score ?? '–'}
        </span>
      </div>
      <span className="text-[11px] text-ts-text-secondary text-center leading-tight">{label}</span>
    </div>
  );
}

interface VitalDef {
  key: 'lcpMs' | 'cls' | 'inpMs' | 'fcpMs' | 'tbtMs';
  label: string;
  good: number;
  poor: number;
  format: (v: number) => string;
}

const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);

const VITALS: VitalDef[] = [
  { key: 'lcpMs', label: 'LCP', good: 2500, poor: 4000, format: ms },
  { key: 'cls', label: 'CLS', good: 0.1, poor: 0.25, format: (v) => v.toFixed(3) },
  { key: 'inpMs', label: 'INP (field)', good: 200, poor: 500, format: ms },
  { key: 'fcpMs', label: 'FCP', good: 1800, poor: 3000, format: ms },
  { key: 'tbtMs', label: 'TBT', good: 200, poor: 600, format: ms },
];

function StrategyView({ data }: { data: LighthouseStrategyResult }) {
  const { scores, vitals, opportunities } = data;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-2">
        <ScoreCircle label="Performance" score={scores.performance} />
        <ScoreCircle label="Accessibility" score={scores.accessibility} />
        <ScoreCircle label="Best Practices" score={scores.bestPractices} />
        <ScoreCircle label="SEO" score={scores.seo} />
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ts-text-secondary mb-2">
          Core Web Vitals
          {vitals.fieldCategory && (
            <span className="ml-2 normal-case font-normal">· field data: {vitals.fieldCategory}</span>
          )}
        </h4>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {VITALS.map((v) => {
            const value = vitals[v.key];
            const rating = value === undefined ? null : metricRating(value, v.good, v.poor);
            return (
              <div key={v.key} className="rounded-lg border border-ts-border bg-ts-surface-light/30 px-2.5 py-2">
                <div className="text-[11px] text-ts-text-secondary">{v.label}</div>
                <div
                  className={`text-sm font-semibold ${rating ? RATING_CLASS[rating] : 'text-ts-text-secondary'}`}
                >
                  {value === undefined ? '–' : v.format(value)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {opportunities.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ts-text-secondary mb-2">
            Top Opportunities
          </h4>
          <ul className="space-y-1.5">
            {opportunities.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-ts-text-primary truncate">{o.title}</span>
                {o.savingsMs !== undefined && (
                  <span className="shrink-0 text-xs text-ts-warning">−{ms(o.savingsMs)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function LighthousePanel({ data }: { data: LighthouseResult }) {
  const [strategy, setStrategy] = useState<'mobile' | 'desktop'>(data.mobile ? 'mobile' : 'desktop');
  const current = data[strategy];

  const toggleClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
      active ? 'bg-adobe-red/15 text-adobe-red' : 'text-ts-text-secondary hover:text-ts-text-primary'
    }`;

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-ts-border p-1 gap-1">
        <button type="button" className={toggleClass(strategy === 'mobile')} onClick={() => setStrategy('mobile')}>
          <Smartphone className="w-3.5 h-3.5" /> Mobile
        </button>
        <button type="button" className={toggleClass(strategy === 'desktop')} onClick={() => setStrategy('desktop')}>
          <Monitor className="w-3.5 h-3.5" /> Desktop
        </button>
      </div>

      {current ? (
        <StrategyView data={current} />
      ) : (
        <p className="text-sm text-ts-text-secondary">No {strategy} result available.</p>
      )}

      {data.error && <p className="text-xs text-ts-warning break-words">{data.error}</p>}
      <p className="text-[11px] text-ts-text-secondary">
        Google PageSpeed Insights · {new Date(data.fetchedAt).toLocaleString()}
      </p>
    </div>
  );
}

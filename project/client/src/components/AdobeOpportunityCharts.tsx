import { useRef, useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { BarChart3 } from 'lucide-react';
import type { AnalysisResult, CategoryResult, DetectedTechnology } from '../types/analysis';

gsap.registerPlugin(useGSAP);

function isEmptyOrNotDetected(val: string): boolean {
  const v = (val ?? '').trim().toLowerCase();
  return !v || /^(not detected|n\/a|na|none|-|—|–)$/.test(v);
}

function isAdobeInCategory(val: string): boolean {
  const v = (val ?? '').trim();
  return /adobe|magento|marketo|\bAEM\b|experience manager|adobe commerce|adobe campaign|journey optimizer|workfront|genstudio|audience manager|real-time cdp/i.test(v);
}

function isFilledAndNotAdobe(val: string): boolean {
  return !isEmptyOrNotDetected(val) && !isAdobeInCategory(val);
}

const ADOBE_RED = '#E8503A';
const TS_ACCENT = '#8B8FA0';
const TS_SUCCESS = '#4ADE80';
const TS_WARNING = '#D4A055';
const TS_TEXT_SECONDARY = '#7C7C8A';

function computeChartData(results: AnalysisResult) {
  const totalCategories = results.categories.length;

  const opportunityCount = results.categories.filter(
    (c) => !isAdobeInCategory(c.currentTechnology),
  ).length;
  const opportunityScore =
    totalCategories > 0 ? Math.round((opportunityCount / totalCategories) * 100) : 0;

  const adobeCategories = results.categories.filter((c) =>
    isAdobeInCategory(c.currentTechnology),
  ).length;
  const competitorCategories = results.categories.filter((c) =>
    isFilledAndNotAdobe(c.currentTechnology),
  ).length;

  const categoryStatus = results.categories.map((cat: CategoryResult) => {
    const isAdobe = isAdobeInCategory(cat.currentTechnology);
    const isOpportunity = isEmptyOrNotDetected(cat.currentTechnology);
    let status: 'adobe' | 'opportunity' | 'competitor' = 'competitor';
    if (isAdobe) status = 'adobe';
    else if (isOpportunity) status = 'opportunity';
    return {
      category: cat.category,
      value: 1,
      status,
      fill:
        status === 'adobe'
          ? TS_SUCCESS
          : status === 'opportunity'
            ? TS_WARNING
            : TS_TEXT_SECONDARY,
    };
  });

  const confidenceBuckets = results.rawDetections.reduce(
    (acc, t: DetectedTechnology) => {
      const bucket = t.confidence >= 90 ? '90%+' : t.confidence >= 80 ? '80-89%' : '70-79%';
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const confidenceData = [
    { name: '90%+', count: confidenceBuckets['90%+'] || 0, fill: TS_SUCCESS },
    { name: '80-89%', count: confidenceBuckets['80-89%'] || 0, fill: TS_ACCENT },
    { name: '70-79%', count: confidenceBuckets['70-79%'] || 0, fill: TS_WARNING },
  ];

  return {
    adobeVsCompetitor: [
      { name: 'Adobe', count: adobeCategories, fill: ADOBE_RED },
      { name: 'Competitors', count: competitorCategories, fill: TS_ACCENT },
    ],
    opportunityScore,
    categoryStatus,
    confidenceData,
    hasData: results.rawDetections.length > 0 || results.categories.length > 0,
  };
}

/* ── Custom Animated Gauge ── */

function AnimatedGauge({ score }: { score: number }) {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const obj = { val: 0 };
    gsap.to(obj, {
      val: score,
      duration: 1.8,
      ease: 'power3.out',
      onUpdate: () => setAnimatedScore(Math.round(obj.val)),
    });
  }, [score]);

  const size = 180;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - animatedScore / 100);
  const center = size / 2;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full max-w-[200px] mx-auto"
    >
      <defs>
        <linearGradient id="donutGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={ADOBE_RED} />
          <stop offset="100%" stopColor={TS_ACCENT} />
        </linearGradient>
      </defs>

      {/* Background ring */}
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke={TS_TEXT_SECONDARY}
        strokeOpacity="0.12"
        strokeWidth={stroke}
      />

      {/* Animated progress ring (rotated so it starts at 12 o'clock) */}
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke="url(#donutGradient)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${center} ${center})`}
      />

      {/* Center text */}
      <text
        x={center}
        y={center - 4}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-ts-text-primary font-bold"
        fontSize="34"
      >
        {animatedScore}%
      </text>
      <text
        x={center}
        y={center + 24}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-ts-text-secondary"
        fontSize="11"
        letterSpacing="0.05em"
      >
        OPPORTUNITY
      </text>
    </svg>
  );
}

interface AdobeOpportunityChartsProps {
  results: AnalysisResult;
}

export default function AdobeOpportunityCharts({ results }: AdobeOpportunityChartsProps) {
  const data = computeChartData(results);
  const chartsRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!chartsRef.current) return;
      const cards = chartsRef.current.querySelectorAll('.chart-card');
      gsap.fromTo(
        cards,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.12, ease: 'power3.out' },
      );
    },
    { scope: chartsRef },
  );

  if (!data.hasData) return null;

  return (
    <div className="mt-8 space-y-6">
      <h3 className="text-lg font-semibold text-ts-text-primary flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-ts-accent" strokeWidth={1.5} />
        Adobe Opportunity Insights
      </h3>

      <div ref={chartsRef} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Animated Gauge */}
        {data.categoryStatus.length > 0 && (
          <div className="chart-card bg-ts-surface-card rounded-xl border border-ts-border p-6">
            <h4 className="text-sm font-medium text-ts-text-secondary mb-4">
              Placement Potential
            </h4>
            <AnimatedGauge score={data.opportunityScore} />
            <p className="text-center text-xs text-ts-text-secondary mt-3">
              % of categories where Adobe could be placed
            </p>
          </div>
        )}

        {/* Adobe vs. Competitors */}
        {data.adobeVsCompetitor.some((d) => d.count > 0) && (
          <div className="chart-card bg-ts-surface-card rounded-xl border border-ts-border p-6">
            <h4 className="text-sm font-medium text-ts-text-secondary mb-4">
              Adobe vs. Competitors
            </h4>
            <p className="text-xs text-ts-text-secondary mb-3">
              Categories using Adobe vs. categories using competitors
            </p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart
                data={data.adobeVsCompetitor}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="adobeBarGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={ADOBE_RED} stopOpacity={0.8} />
                    <stop offset="100%" stopColor={ADOBE_RED} />
                  </linearGradient>
                  <linearGradient id="compBarGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={TS_ACCENT} stopOpacity={0.8} />
                    <stop offset="100%" stopColor={TS_ACCENT} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={TS_TEXT_SECONDARY} opacity={0.15} />
                <XAxis type="number" stroke={TS_TEXT_SECONDARY} fontSize={12} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke={TS_TEXT_SECONDARY}
                  fontSize={12}
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1A1A1E',
                    border: '1px solid #2A2A2F',
                    borderRadius: '8px',
                    boxShadow: '0 0 20px rgba(139, 143, 160, 0.08)',
                  }}
                  labelStyle={{ color: '#EDEDF0' }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={28}>
                  {data.adobeVsCompetitor.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? 'url(#adobeBarGrad)' : 'url(#compBarGrad)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Category Opportunity Map */}
        {data.categoryStatus.length > 0 && (
          <div className="chart-card bg-ts-surface-card rounded-xl border border-ts-border p-6 lg:col-span-2">
            <h4 className="text-sm font-medium text-ts-text-secondary mb-4">
              Category Status
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {data.categoryStatus.map((entry) => (
                <div
                  key={entry.category}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-ts-surface-light/50 border border-ts-border/50"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: entry.fill }}
                  />
                  <span className="text-sm text-ts-text-primary truncate flex-1">
                    {entry.category}
                  </span>
                  <span
                    className="text-xs font-medium shrink-0"
                    style={{ color: entry.fill }}
                  >
                    {entry.status === 'adobe'
                      ? 'Adobe'
                      : entry.status === 'opportunity'
                        ? 'Opportunity'
                        : 'Competitor'}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 mt-4 text-xs text-ts-text-secondary">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-ts-success" />
                Adobe detected
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-ts-warning" />
                Placement opportunity
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-ts-text-secondary" />
                Competitor
              </span>
            </div>
          </div>
        )}

        {/* Confidence Distribution */}
        {data.confidenceData.some((d) => d.count > 0) && (
          <div className="chart-card bg-ts-surface-card rounded-xl border border-ts-border p-6">
            <h4 className="text-sm font-medium text-ts-text-secondary mb-4">
              Detection Confidence
            </h4>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={data.confidenceData}
                margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="confGradSuccess" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={TS_SUCCESS} />
                    <stop offset="100%" stopColor={TS_SUCCESS} stopOpacity={0.6} />
                  </linearGradient>
                  <linearGradient id="confGradAccent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={TS_ACCENT} />
                    <stop offset="100%" stopColor={TS_ACCENT} stopOpacity={0.6} />
                  </linearGradient>
                  <linearGradient id="confGradWarning" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={TS_WARNING} />
                    <stop offset="100%" stopColor={TS_WARNING} stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={TS_TEXT_SECONDARY} opacity={0.15} />
                <XAxis dataKey="name" stroke={TS_TEXT_SECONDARY} fontSize={12} />
                <YAxis stroke={TS_TEXT_SECONDARY} fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1A1A1E',
                    border: '1px solid #2A2A2F',
                    borderRadius: '8px',
                    boxShadow: '0 0 20px rgba(139, 143, 160, 0.08)',
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {data.confidenceData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={
                        i === 0
                          ? 'url(#confGradSuccess)'
                          : i === 1
                            ? 'url(#confGradAccent)'
                            : 'url(#confGradWarning)'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

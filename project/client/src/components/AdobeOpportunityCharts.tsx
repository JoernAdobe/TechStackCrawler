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

const ADOBE_RED = '#EB1000';
const TS_ACCENT = '#6366f1';
const TS_SUCCESS = '#22c55e';
const TS_WARNING = '#f59e0b';
const TS_TEXT_SECONDARY = '#8888a0';

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
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const obj = { val: 0 };
    gsap.to(obj, {
      val: score,
      duration: 1.8,
      ease: 'power3.out',
      onUpdate: () => setAnimatedScore(Math.round(obj.val)),
    });
  }, [score]);

  const radius = 70;
  const strokeWidth = 12;
  const cx = 90;
  const cy = 90;
  const startAngle = 180;
  const endAngle = 0;
  const sweepRange = startAngle - endAngle;
  const currentAngle = startAngle - (animatedScore / 100) * sweepRange;

  const polarToCartesian = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
  };

  const start = polarToCartesian(startAngle);
  const end = polarToCartesian(currentAngle);
  const largeArc = animatedScore > 50 ? 1 : 0;

  const bgStart = polarToCartesian(startAngle);
  const bgEnd = polarToCartesian(endAngle);

  return (
    <svg viewBox="0 0 180 110" className="w-full max-w-[220px] mx-auto">
      <defs>
        <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={TS_TEXT_SECONDARY} stopOpacity="0.3" />
          <stop offset="50%" stopColor={ADOBE_RED} />
          <stop offset="100%" stopColor={TS_ACCENT} />
        </linearGradient>
        <filter id="gaugeGlow">
          <feGaussianBlur stdDeviation="3" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background arc */}
      <path
        d={`M ${bgStart.x} ${bgStart.y} A ${radius} ${radius} 0 1 1 ${bgEnd.x} ${bgEnd.y}`}
        fill="none"
        stroke={TS_TEXT_SECONDARY}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity="0.15"
      />

      {/* Animated arc */}
      {animatedScore > 0 && (
        <path
          ref={pathRef}
          d={`M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`}
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          filter="url(#gaugeGlow)"
        />
      )}

      {/* Score text */}
      <text x={cx} y={cy - 5} textAnchor="middle" className="fill-ts-text-primary text-2xl font-bold" fontSize="28">
        {animatedScore}%
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" className="fill-ts-text-secondary text-xs" fontSize="11">
        Opportunity
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

      <div ref={chartsRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Animated Gauge */}
        {data.categoryStatus.length > 0 && (
          <div className="chart-card bg-ts-surface-card rounded-xl border border-ts-border p-6 shadow-glow-accent">
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
          <div className="chart-card bg-ts-surface-card rounded-xl border border-ts-border p-6 hover:shadow-glow-accent transition-shadow duration-300">
            <h4 className="text-sm font-medium text-ts-text-secondary mb-4">
              Adobe vs. Competitors
            </h4>
            <p className="text-xs text-ts-text-secondary mb-3">
              Categories using Adobe vs. categories using competitors
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={data.adobeVsCompetitor}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
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
                <XAxis type="number" stroke={TS_TEXT_SECONDARY} fontSize={12} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke={TS_TEXT_SECONDARY}
                  fontSize={12}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a2e',
                    border: '1px solid #2a2a3e',
                    borderRadius: '8px',
                    boxShadow: '0 0 20px rgba(99, 102, 241, 0.1)',
                  }}
                  labelStyle={{ color: '#f0f0f5' }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
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
          <div className="chart-card bg-ts-surface-card rounded-xl border border-ts-border p-6 lg:col-span-2 hover:shadow-glow-accent transition-shadow duration-300">
            <h4 className="text-sm font-medium text-ts-text-secondary mb-4">
              Category Status
            </h4>
            <ResponsiveContainer width="100%" height={Math.max(200, data.categoryStatus.length * 36)}>
              <BarChart
                data={data.categoryStatus}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={TS_TEXT_SECONDARY} opacity={0.15} />
                <XAxis type="number" stroke={TS_TEXT_SECONDARY} fontSize={12} domain={[0, 1]} hide />
                <YAxis
                  type="category"
                  dataKey="category"
                  stroke={TS_TEXT_SECONDARY}
                  fontSize={12}
                  width={120}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={24}>
                  {data.categoryStatus.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
          <div className="chart-card bg-ts-surface-card rounded-xl border border-ts-border p-6 hover:shadow-glow-accent transition-shadow duration-300">
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
                    backgroundColor: '#1a1a2e',
                    border: '1px solid #2a2a3e',
                    borderRadius: '8px',
                    boxShadow: '0 0 20px rgba(99, 102, 241, 0.1)',
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

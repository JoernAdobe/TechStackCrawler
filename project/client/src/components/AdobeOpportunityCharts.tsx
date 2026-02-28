import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  PolarRadiusAxis,
  Cell,
} from 'recharts';
import type { AnalysisResult, CategoryResult, DetectedTechnology } from '../types/analysis';

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

  // Placement Potential: % of categories where Adobe could be placed (empty or competitor)
  const opportunityCount = results.categories.filter(
    (c) => !isAdobeInCategory(c.currentTechnology),
  ).length;
  const opportunityScore =
    totalCategories > 0 ? Math.round((opportunityCount / totalCategories) * 100) : 0;

  // Adobe vs. Competitors: category-level (not raw detections)
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

interface AdobeOpportunityChartsProps {
  results: AnalysisResult;
}

export default function AdobeOpportunityCharts({ results }: AdobeOpportunityChartsProps) {
  const data = computeChartData(results);

  if (!data.hasData) return null;

  const gaugeData = [
    {
      name: 'Opportunity',
      value: data.opportunityScore,
      fill: data.opportunityScore >= 50 ? ADOBE_RED : TS_TEXT_SECONDARY,
    },
  ];

  return (
    <div className="mt-8 space-y-6">
      <h3 className="text-lg font-semibold text-ts-text-primary flex items-center gap-2">
        <span className="text-xl">📊</span>
        Adobe Opportunity Insights
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Adobe Opportunity Score (Gauge) */}
        {data.categoryStatus.length > 0 && (
          <div className="bg-ts-surface-card rounded-xl border border-ts-border p-6">
            <h4 className="text-sm font-medium text-ts-text-secondary mb-4">
              Placement Potential
            </h4>
            <div className="relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height={180}>
                <RadialBarChart
                  innerRadius="60%"
                  outerRadius="100%"
                  data={gaugeData}
                  startAngle={180}
                  endAngle={0}
                >
                  <PolarRadiusAxis domain={[0, 100]} tick={false} />
                  <RadialBar
                    background={{ fill: 'rgba(136, 136, 160, 0.2)' }}
                    dataKey="value"
                    cornerRadius={8}
                    label={false}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold text-ts-text-primary">
                  {data.opportunityScore}%
                </span>
              </div>
            </div>
            <p className="text-center text-xs text-ts-text-secondary mt-2">
              % of categories where Adobe could be placed (empty or competitor)
            </p>
          </div>
        )}

        {/* Adobe vs. Competitors */}
        {data.adobeVsCompetitor.some((d) => d.count > 0) && (
          <div className="bg-ts-surface-card rounded-xl border border-ts-border p-6">
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
                <CartesianGrid strokeDasharray="3 3" stroke={TS_TEXT_SECONDARY} opacity={0.3} />
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
                  }}
                  labelStyle={{ color: '#f0f0f5' }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {data.adobeVsCompetitor.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Category Opportunity Map */}
        {data.categoryStatus.length > 0 && (
          <div className="bg-ts-surface-card rounded-xl border border-ts-border p-6 lg:col-span-2">
            <h4 className="text-sm font-medium text-ts-text-secondary mb-4">
              Category Status
            </h4>
            <ResponsiveContainer width="100%" height={Math.max(200, data.categoryStatus.length * 36)}>
              <BarChart
                data={data.categoryStatus}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={TS_TEXT_SECONDARY} opacity={0.3} />
                <XAxis type="number" stroke={TS_TEXT_SECONDARY} fontSize={12} domain={[0, 1]} hide />
                <YAxis
                  type="category"
                  dataKey="category"
                  stroke={TS_TEXT_SECONDARY}
                  fontSize={12}
                  width={120}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
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
          <div className="bg-ts-surface-card rounded-xl border border-ts-border p-6">
            <h4 className="text-sm font-medium text-ts-text-secondary mb-4">
              Detection Confidence
            </h4>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={data.confidenceData}
                margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={TS_TEXT_SECONDARY} opacity={0.3} />
                <XAxis dataKey="name" stroke={TS_TEXT_SECONDARY} fontSize={12} />
                <YAxis stroke={TS_TEXT_SECONDARY} fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a2e',
                    border: '1px solid #2a2a3e',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {data.confidenceData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
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

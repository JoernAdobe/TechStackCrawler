import { useEffect, useState, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface TechCount {
  name: string;
  count: number;
}

interface WeekBucket {
  week: string;
  count: number;
}

interface Stats {
  totalAnalyses: number;
  uniqueDomains: number;
  avgTechPerAnalysis: number;
  totalTechDetected: number;
  adobeOpportunities: number;
  useCaseDiscoveries: number;
  estimatedHoursSaved: number;
  estimatedCostSaved: number;
  analysesPerWeek: WeekBucket[];
  topTechnologies: TechCount[];
  categoryBreakdown: TechCount[];
  firstAnalysisDate: string | null;
  daysSinceFirstUse: number;
}

interface Props {
  token: string;
  onLogout: () => void;
}

const PIE_COLORS = [
  '#6366f1', '#8b5cf6', '#a78bfa', '#c084fc',
  '#818cf8', '#4f46e5', '#7c3aed', '#6d28d9',
  '#a855f7', '#9333ea', '#5b21b6', '#4338ca',
];

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);
}

function formatWeekLabel(week: string): string {
  const parts = week.split('-W');
  if (parts.length !== 2) return week;
  return `W${parts[1]}`;
}

export default function Dashboard({ token, onLogout }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error('Failed to load stats');
      setStats(await res.json());
    } catch {
      setError('Could not load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="min-h-screen bg-ts-surface flex items-center justify-center">
        <div className="animate-pulse text-ts-text-secondary">Loading dashboard…</div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-screen bg-ts-surface flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error || 'No data available'}</p>
          <button onClick={onLogout} className="text-sm text-ts-accent hover:underline">
            Back to login
          </button>
        </div>
      </div>
    );
  }

  const avgAnalysesPerWeek = stats.analysesPerWeek.length > 0
    ? Math.round((stats.totalAnalyses / stats.analysesPerWeek.length) * 10) / 10
    : 0;

  const manualMinutesPerAnalysis = 210;
  const toolMinutesPerAnalysis = 2;
  const totalManualMinutes = stats.totalAnalyses * manualMinutesPerAnalysis;
  const totalToolMinutes = stats.totalAnalyses * toolMinutesPerAnalysis;
  const speedFactor = manualMinutesPerAnalysis / toolMinutesPerAnalysis;

  return (
    <div className="min-h-screen bg-ts-surface text-ts-text-primary">
      {/* Header */}
      <header className="w-full border-b border-ts-border/50 backdrop-blur-sm bg-ts-surface/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-adobe-red to-red-700 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13.966 22.624l-1.69-4.281H8.122l3.892-9.144 5.662 13.425zM8.884 1.376H0v21.248zm6.232 0L24 22.624V1.376z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Usage Dashboard</h1>
              <p className="text-xs text-ts-text-secondary">TechStack Analyzer — ROI & Adoption</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="#/" className="text-xs text-ts-text-secondary hover:text-ts-accent transition-colors">
              ← Analyzer
            </a>
            <button
              onClick={onLogout}
              className="text-xs px-3 py-1.5 rounded-lg border border-ts-border bg-ts-surface-light hover:bg-ts-surface-hover transition-colors text-ts-text-secondary hover:text-ts-text-primary"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* ROI Hero */}
        <section className="rounded-2xl border border-ts-border bg-gradient-to-br from-ts-surface-card to-ts-surface-light p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold">
                {formatCurrency(stats.estimatedCostSaved)}
              </h2>
              <p className="text-ts-text-secondary mt-1">geschaetzter Wert der eingesparten Arbeit</p>
              <p className="text-xs text-ts-text-secondary mt-2">
                Basierend auf {stats.estimatedHoursSaved}h manuellem Aufwand × {formatCurrency(150)}/h Berater-Stundensatz
              </p>
            </div>
            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-2xl font-bold text-ts-success">{speedFactor}×</div>
                <div className="text-xs text-ts-text-secondary mt-0.5">schneller als manuell</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-ts-accent">{stats.estimatedHoursSaved}h</div>
                <div className="text-xs text-ts-text-secondary mt-0.5">Stunden eingespart</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-ts-warning">{stats.daysSinceFirstUse}</div>
                <div className="text-xs text-ts-text-secondary mt-0.5">Tage im Einsatz</div>
              </div>
            </div>
          </div>
        </section>

        {/* KPI Cards */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Analysen gesamt" value={stats.totalAnalyses} />
          <KpiCard label="Unique Domains" value={stats.uniqueDomains} />
          <KpiCard label="Adobe Opportunities" value={stats.adobeOpportunities} color="text-adobe-red" />
          <KpiCard label="Use-Case Discoveries" value={stats.useCaseDiscoveries} color="text-ts-accent" />
          <KpiCard label="Ø Tech/Analyse" value={stats.avgTechPerAnalysis} />
          <KpiCard label="Tech insgesamt erkannt" value={stats.totalTechDetected} />
          <KpiCard label="Ø Analysen/Woche" value={avgAnalysesPerWeek} />
          <KpiCard
            label="Tool-Zeit vs. manuell"
            value={`${totalToolMinutes} min`}
            sub={`statt ${Math.round(totalManualMinutes / 60)}h`}
            color="text-ts-success"
          />
        </section>

        {/* Charts Row */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Analyses Over Time */}
          <div className="rounded-xl border border-ts-border bg-ts-surface-card p-5">
            <h3 className="text-sm font-semibold mb-4 text-ts-text-secondary uppercase tracking-wider">
              Analysen pro Woche
            </h3>
            {stats.analysesPerWeek.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={stats.analysesPerWeek}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                  <XAxis dataKey="week" tickFormatter={formatWeekLabel} tick={{ fill: '#8888a0', fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fill: '#8888a0', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 8, fontSize: 12 }}
                    labelFormatter={(l) => `Woche ${l}`}
                  />
                  <Area type="monotone" dataKey="count" stroke="#6366f1" fill="url(#areaGrad)" strokeWidth={2} name="Analysen" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-ts-text-secondary text-sm py-12 text-center">Noch keine Daten</p>
            )}
          </div>

          {/* Top Technologies */}
          <div className="rounded-xl border border-ts-border bg-ts-surface-card p-5">
            <h3 className="text-sm font-semibold mb-4 text-ts-text-secondary uppercase tracking-wider">
              Meist erkannte Technologien
            </h3>
            {stats.topTechnologies.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.topTechnologies.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: '#8888a0', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fill: '#f0f0f5', fontSize: 11 }} width={75} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} name="Vorkommen" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-ts-text-secondary text-sm py-12 text-center">Noch keine Daten</p>
            )}
          </div>
        </section>

        {/* Second Row */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Category Breakdown */}
          <div className="rounded-xl border border-ts-border bg-ts-surface-card p-5">
            <h3 className="text-sm font-semibold mb-4 text-ts-text-secondary uppercase tracking-wider">
              Technologie-Kategorien
            </h3>
            {stats.categoryBreakdown.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={220}>
                  <PieChart>
                    <Pie
                      data={stats.categoryBreakdown.slice(0, 8)}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      dataKey="count"
                      nameKey="name"
                      stroke="none"
                    >
                      {stats.categoryBreakdown.slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 8, fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5 text-xs">
                  {stats.categoryBreakdown.slice(0, 8).map((cat, i) => (
                    <div key={cat.name} className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="text-ts-text-secondary truncate flex-1">{cat.name}</span>
                      <span className="text-ts-text-primary font-medium">{cat.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-ts-text-secondary text-sm py-12 text-center">Noch keine Daten</p>
            )}
          </div>

          {/* Time Savings Breakdown */}
          <div className="rounded-xl border border-ts-border bg-ts-surface-card p-5">
            <h3 className="text-sm font-semibold mb-4 text-ts-text-secondary uppercase tracking-wider">
              Zeitersparnis-Rechnung
            </h3>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-ts-border/50">
                <span className="text-ts-text-secondary">Manueller Aufwand pro Analyse</span>
                <span className="font-medium">~3.5 Stunden</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-ts-border/50">
                <span className="text-ts-text-secondary">Tool-Dauer pro Analyse</span>
                <span className="font-medium text-ts-success">~2 Minuten</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-ts-border/50">
                <span className="text-ts-text-secondary">Analysen durchgefuehrt</span>
                <span className="font-medium">{stats.totalAnalyses}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-ts-border/50">
                <span className="text-ts-text-secondary">Gesamtzeit manuell</span>
                <span className="font-medium text-red-400">{Math.round(totalManualMinutes / 60)}h</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-ts-border/50">
                <span className="text-ts-text-secondary">Gesamtzeit mit Tool</span>
                <span className="font-medium text-ts-success">{totalToolMinutes} min</span>
              </div>
              <div className="flex justify-between items-center py-3 bg-ts-surface-light rounded-lg px-3 -mx-1">
                <span className="font-semibold">Netto-Zeitersparnis</span>
                <span className="font-bold text-ts-success text-base">
                  {stats.estimatedHoursSaved}h ({formatCurrency(stats.estimatedCostSaved)})
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Footer info */}
        <p className="text-center text-xs text-ts-text-secondary pb-4">
          Erste Analyse: {stats.firstAnalysisDate
            ? new Date(stats.firstAnalysisDate).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
            : '—'}
          {' · '}
          Daten werden live aus der Datenbank berechnet
        </p>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color }: {
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-ts-border bg-ts-surface-card p-4">
      <div className={`text-2xl font-bold ${color ?? 'text-ts-text-primary'}`}>
        {typeof value === 'number' ? value.toLocaleString('de-DE') : value}
      </div>
      {sub && <div className="text-xs text-ts-text-secondary mt-0.5">{sub}</div>}
      <div className="text-xs text-ts-text-secondary mt-1">{label}</div>
    </div>
  );
}

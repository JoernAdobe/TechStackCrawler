import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface NamedCount {
  name: string;
  count: number;
}

export interface UsageStats {
  trackingSince: string | null;
  users: {
    total: number;
    dau: number;
    wau: number;
    mau: number;
    avgDau30: number;
    stickiness: number | null;
    returning: number;
    returnRate: number | null;
    powerUsers: number;
    weeklyRetention: number | null;
    newLast30d: number;
    visits: number;
    visitsLast30d: number;
    avgVisitsPerUser: number;
    avgActiveDaysPerUser: number;
    avgActionsPerUser: number;
    usageRate: number | null;
  };
  usersPerWeek: Array<{ week: string; activeUsers: number; newUsers: number; returningUsers: number }>;
  featureUsage: Array<{ name: string; total: number; last30d: number }>;
  exports: { total: number; last30d: number };
  integrations: { rfpContext: number; mcpCalls: number };
  topUsers: Array<{ label: string; actions: number; activeDays: number; visits: number; lastSeen: string }>;
  briefings: {
    total: number;
    done: number;
    failed: number;
    inProgress: number;
    accounts: number;
    creators: number;
    avgMinutes: number | null;
    perWeek: NamedCount[];
  };
  batches: { total: number; items: number };
  feedback: { total: number; avgRating: number | null };
  reliability: { runsLast30d: number; failedLast30d: number; successRate: number | null };
  funnel: { accounts: number; withUseCases: number; withGeo: number; withBriefing: number; exported: number };
}

const FEATURE_LABELS: Record<string, string> = {
  analysis: 'Tech stack analysis',
  use_cases: 'Use case discovery',
  briefing: 'Client Pre-Briefing',
  geo_score: 'GEO score',
  observepoint: 'ObservePoint scan',
  export_pdf: 'PDF export (full)',
  export_briefing_pdf: 'PDF export (briefing)',
  export_briefing_html: 'HTML export (briefing)',
  export_deck: 'PPTX deck',
  export_batch: 'Batch export',
  export_markdown: 'Markdown export',
  export_excel: 'Excel export',
  account_view: 'Account opened',
  library_view: 'Library opened',
  batch: 'Batch run',
  feedback: 'Feedback',
  tts: 'Audio summary',
  rfp_context: 'RFP tool context',
  mcp_call: 'MCP / Coworker call',
};

const TOOLTIP_STYLE = { background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 8, fontSize: 12 };
const CARD = 'rounded-xl border border-ts-border bg-ts-surface-card p-5';
const H3 = 'text-sm font-semibold mb-4 text-ts-text-secondary uppercase tracking-wider';

function Kpi({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-ts-border bg-ts-surface-card p-4">
      <div className={`text-2xl font-bold ${color ?? 'text-ts-text-primary'}`}>
        {typeof value === 'number' ? value.toLocaleString('en-US') : value}
      </div>
      {sub && <div className="text-xs text-ts-text-secondary mt-0.5">{sub}</div>}
      <div className="text-xs text-ts-text-secondary mt-1">{label}</div>
    </div>
  );
}

function rate(v: number | null): string {
  return v == null ? '—' : `${v}%`;
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
}

function weekLabel(week: string): string {
  const i = week.indexOf('-W');
  return i >= 0 ? `W${week.slice(i + 2)}` : week;
}

export default function UsageSections({ usage, topAccounts, analysesLast30d }: {
  usage: UsageStats;
  topAccounts: NamedCount[];
  analysesLast30d: number;
}) {
  const { users, briefings, funnel } = usage;
  const features = usage.featureUsage
    .filter((f) => f.name !== 'library_view' && f.name !== 'account_view')
    .slice(0, 12)
    .map((f) => ({ ...f, label: FEATURE_LABELS[f.name] ?? f.name }));
  const funnelSteps = [
    { label: 'Accounts analyzed', value: funnel.accounts },
    { label: 'with use cases', value: funnel.withUseCases },
    { label: 'with GEO score', value: funnel.withGeo },
    { label: 'with Pre-Briefing', value: funnel.withBriefing },
    { label: 'exported (PDF/PPTX/…)', value: funnel.exported },
  ];
  const since = usage.trackingSince
    ? new Date(usage.trackingSince).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <>
      <section aria-labelledby="users-heading" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="users-heading" className="text-lg font-semibold">Users &amp; adoption</h2>
          <span className="text-xs text-ts-text-secondary">
            {since ? `Tracking since ${since}` : 'Tracking starts with the next visit'} · anonymous first-party ID per browser · admin excluded
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Kpi label="Total users" value={users.total} sub={`${users.newLast30d} new in last 30 days`} color="text-adobe-red" />
          <Kpi label="Monthly active users" value={users.mau} sub={`${users.wau} weekly · ${users.dau} today`} />
          <Kpi label="Return rate" value={rate(users.returnRate)} sub={`${users.returning} users came back on another day`} color="text-ts-success" />
          <Kpi label="Weekly retention" value={rate(users.weeklyRetention)} sub="of last week's users active again this week" color="text-ts-success" />
          <Kpi label="Visits" value={users.visits} sub={`${users.visitsLast30d} in last 30 days · Ø ${users.avgVisitsPerUser} per user`} />
          <Kpi label="Usage rate" value={rate(users.usageRate)} sub="of visits with at least one action" color="text-adobe-red" />
          <Kpi label="Stickiness (DAU/MAU)" value={rate(users.stickiness)} sub={`Ø ${users.avgDau30} daily active users`} />
          <Kpi label="Power users" value={users.powerUsers} sub={`active on ≥ 5 days · Ø ${users.avgActiveDaysPerUser} days per user`} />
          <Kpi label="Analyses (30 days)" value={analysesLast30d} sub={`Ø ${users.avgActionsPerUser} actions per user`} />
          <Kpi label="Pre-Briefings" value={briefings.done} sub={`${briefings.accounts} accounts · ${briefings.avgMinutes ?? '—'} min avg · ${briefings.failed} failed`} color="text-adobe-red" />
          <Kpi label="Exports" value={usage.exports.total} sub={`${usage.exports.last30d} in last 30 days`} />
          <Kpi
            label="Analysis success rate (30 days)"
            value={rate(usage.reliability.successRate)}
            sub={`${usage.reliability.failedLast30d} of ${usage.reliability.runsLast30d} runs failed`}
            color="text-ts-success"
          />
          <Kpi label="Batch runs" value={usage.batches.total} sub={`${usage.batches.items} accounts in batches`} />
          <Kpi label="RFP tool context pulls" value={usage.integrations.rfpContext} />
          <Kpi label="MCP / Coworker calls" value={usage.integrations.mcpCalls} />
          <Kpi label="Feedback" value={usage.feedback.total} sub={usage.feedback.avgRating != null ? `Ø ${usage.feedback.avgRating} / 5` : 'no ratings yet'} />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={CARD}>
          <h3 className={H3}>New vs. returning users per week</h3>
          {usage.usersPerWeek.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={usage.usersPerWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                <XAxis dataKey="week" tickFormatter={weekLabel} tick={{ fill: '#8888a0', fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#8888a0', fontSize: 11 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l) => `Week ${l}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" stackId="u" dataKey="returningUsers" name="Returning users" stroke="#EB1000" fill="#EB1000" fillOpacity={0.25} strokeWidth={2} />
                <Area type="monotone" stackId="u" dataKey="newUsers" name="New users" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-ts-text-secondary text-sm py-12 text-center">No user activity tracked yet</p>
          )}
        </div>

        <div className={CARD}>
          <h3 className={H3}>Feature usage</h3>
          {features.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(220, features.length * 26)}>
              <BarChart data={features} layout="vertical" margin={{ left: 110 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                <XAxis type="number" allowDecimals={false} tick={{ fill: '#8888a0', fontSize: 11 }} />
                <YAxis dataKey="label" type="category" tick={{ fill: '#f0f0f5', fontSize: 11 }} width={105} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="total" name="All time" fill="#6366f1" radius={[0, 4, 4, 0]} />
                <Bar dataKey="last30d" name="Last 30 days" fill="#EB1000" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-ts-text-secondary text-sm py-12 text-center">No feature usage tracked yet</p>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={CARD}>
          <h3 className={H3}>Account funnel</h3>
          <ol className="space-y-3">
            {funnelSteps.map((s) => (
              <li key={s.label}>
                <div className="flex justify-between text-sm">
                  <span className="text-ts-text-secondary">{s.label}</span>
                  <span className="font-medium">
                    {s.value} <span className="text-xs text-ts-text-secondary">({pct(s.value, funnel.accounts)})</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-ts-surface-light overflow-hidden">
                  <div className="h-full bg-adobe-red" style={{ width: funnel.accounts ? `${(s.value / funnel.accounts) * 100}%` : '0%' }} />
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className={CARD}>
          <h3 className={H3}>Most active users (anonymous)</h3>
          {usage.topUsers.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {usage.topUsers.map((u) => (
                <li key={u.label} className="flex justify-between gap-3">
                  <span className="truncate text-ts-text-secondary" title={`Last seen ${new Date(u.lastSeen).toLocaleString('en-US')}`}>{u.label}</span>
                  <span className="shrink-0 text-xs text-ts-text-secondary">
                    <span className="font-medium text-sm text-ts-text-primary">{u.actions}</span> actions · {u.activeDays} days · {u.visits} visits
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ts-text-secondary text-sm py-8 text-center">No user activity tracked yet</p>
          )}
        </div>

        <div className={CARD}>
          <h3 className={H3}>Most analyzed accounts</h3>
          {topAccounts.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {topAccounts.map((a) => (
                <li key={a.name} className="flex justify-between gap-3">
                  <span className="truncate text-ts-text-secondary">{a.name}</span>
                  <span className="font-medium shrink-0">{a.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ts-text-secondary text-sm py-8 text-center">No data yet</p>
          )}
        </div>
      </section>
    </>
  );
}

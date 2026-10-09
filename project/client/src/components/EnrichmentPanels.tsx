import { useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Gauge, Loader2, Play, RefreshCw, Smartphone, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AnalysisResult } from '../types/analysis';
import type { AnalysisEnrichments } from '../types/parity';
import { apiRequest, toErrorMessage } from '../lib/apiClient';
import LighthousePanel from './LighthousePanel';
import TrafficPanel from './TrafficPanel';
import MobileAppsPanel from './MobileAppsPanel';

type EnrichmentKey = 'lighthouse' | 'traffic' | 'mobileApps';

const ENDPOINT: Record<EnrichmentKey, string> = {
  lighthouse: 'lighthouse',
  traffic: 'traffic',
  mobileApps: 'mobile-apps',
};

interface EnrichmentPanelsProps {
  analysis: AnalysisResult;
  onUpdate: (a: AnalysisResult) => void;
}

interface CardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  hasData: boolean;
  loading: boolean;
  error: string | null;
  onRun: () => void;
  controls?: ReactNode;
  children?: ReactNode;
}

function EnrichmentCard({ title, description, icon: Icon, hasData, loading, error, onRun, controls, children }: CardProps) {
  return (
    <div className="bg-ts-surface-card rounded-2xl border border-ts-border flex flex-col">
      <div className="p-5 border-b border-ts-border flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-ts-text-primary flex items-center gap-2">
            <Icon className="w-5 h-5 text-adobe-red" strokeWidth={1.5} />
            {title}
          </h3>
          <p className="mt-1 text-xs text-ts-text-secondary leading-relaxed">{description}</p>
        </div>
        {hasData && (
          <button
            type="button"
            onClick={onRun}
            disabled={loading}
            title="Re-run"
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-ts-border text-ts-text-secondary hover:text-ts-text-primary hover:border-ts-accent transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Re-run
          </button>
        )}
      </div>

      <div className="p-5 flex-1 space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-adobe-red/30 bg-adobe-red/10 px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-adobe-red shrink-0 mt-0.5" strokeWidth={1.5} />
            <p className="text-xs text-ts-text-secondary break-words">{error}</p>
          </div>
        )}

        {!hasData && controls}

        {hasData ? (
          <div className={loading ? 'opacity-50 pointer-events-none' : ''}>{children}</div>
        ) : (
          <button
            type="button"
            onClick={onRun}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-adobe-red to-adobe-red-dark text-white font-medium rounded-xl hover:opacity-90 transition-all duration-200 disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {loading ? 'Running…' : 'Run'}
          </button>
        )}

        {hasData && controls}
      </div>
    </div>
  );
}

export default function EnrichmentPanels({ analysis, onUpdate }: EnrichmentPanelsProps) {
  const [loading, setLoading] = useState<Record<EnrichmentKey, boolean>>({
    lighthouse: false,
    traffic: false,
    mobileApps: false,
  });
  const [errors, setErrors] = useState<Record<EnrichmentKey, string | null>>({
    lighthouse: null,
    traffic: null,
    mobileApps: null,
  });
  const [brand, setBrand] = useState('');
  const [country, setCountry] = useState('');

  // Neueste Analyse merken, damit parallele Runs sich nicht gegenseitig überschreiben.
  const latest = useRef(analysis);
  latest.current = analysis;

  if (!analysis.id) {
    return (
      <section className="px-6 py-8 max-w-7xl mx-auto">
        <div className="rounded-2xl border border-ts-border bg-ts-surface-card p-5 text-sm text-ts-text-secondary">
          Website performance, traffic and mobile app insights are available once the analysis has been saved.
        </div>
      </section>
    );
  }

  const run = async (key: EnrichmentKey, body?: Record<string, string>) => {
    setLoading((s) => ({ ...s, [key]: true }));
    setErrors((s) => ({ ...s, [key]: null }));
    try {
      const result = await apiRequest<AnalysisEnrichments[EnrichmentKey]>(
        `/api/analyses/${analysis.id}/enrich/${ENDPOINT[key]}`,
        { method: 'POST', body: body ?? {} },
      );
      const updated: AnalysisResult = {
        ...latest.current,
        enrichments: { ...latest.current.enrichments, [key]: result },
      };
      latest.current = updated;
      onUpdate(updated);
    } catch (e: unknown) {
      setErrors((s) => ({ ...s, [key]: toErrorMessage(e) }));
    } finally {
      setLoading((s) => ({ ...s, [key]: false }));
    }
  };

  const runMobileApps = () => {
    const body: Record<string, string> = {};
    if (brand.trim()) body.brand = brand.trim();
    if (/^[A-Za-z]{2}$/.test(country.trim())) body.country = country.trim().toUpperCase();
    void run('mobileApps', body);
  };

  const { lighthouse, traffic, mobileApps } = analysis.enrichments ?? {};
  const inputClass =
    'w-full rounded-lg border border-ts-border bg-ts-surface-light/40 px-3 py-1.5 text-xs text-ts-text-primary placeholder:text-ts-text-secondary focus:outline-none focus:border-ts-accent';

  return (
    <section className="px-6 py-8 max-w-7xl mx-auto">
      <div className="grid gap-4 lg:grid-cols-3">
        <EnrichmentCard
          title="Website Performance"
          description="Lighthouse scores and Core Web Vitals via Google PageSpeed Insights (mobile + desktop)."
          icon={Gauge}
          hasData={!!lighthouse}
          loading={loading.lighthouse}
          error={errors.lighthouse}
          onRun={() => void run('lighthouse')}
        >
          {lighthouse && <LighthousePanel data={lighthouse} />}
        </EnrichmentCard>

        <EnrichmentCard
          title="Traffic"
          description="Global popularity rank (Tranco) and, if configured, Semrush visit metrics."
          icon={TrendingUp}
          hasData={!!traffic}
          loading={loading.traffic}
          error={errors.traffic}
          onRun={() => void run('traffic')}
        >
          {traffic && <TrafficPanel data={traffic} />}
        </EnrichmentCard>

        <EnrichmentCard
          title="Mobile Apps"
          description="Apps linked from the website or found in the App Store for the brand."
          icon={Smartphone}
          hasData={!!mobileApps}
          loading={loading.mobileApps}
          error={errors.mobileApps}
          onRun={runMobileApps}
          controls={
            <div className="grid grid-cols-3 gap-2">
              <input
                className={`${inputClass} col-span-2`}
                placeholder="Brand (optional)"
                value={brand}
                maxLength={100}
                onChange={(e) => setBrand(e.target.value)}
              />
              <input
                className={inputClass}
                placeholder="Country (DE)"
                value={country}
                maxLength={2}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>
          }
        >
          {mobileApps && <MobileAppsPanel data={mobileApps} />}
        </EnrichmentCard>
      </div>
    </section>
  );
}

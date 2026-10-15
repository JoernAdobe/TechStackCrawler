import { useEffect, useRef, useState } from 'react';
import { Radar, Loader2 } from 'lucide-react';
import type { AnalysisResult } from '../types/analysis';
import type { GeoScoreResult } from '../types/parity';
import { apiRequest, isAbortError, toErrorMessage } from '../lib/apiClient';
import GeoScoreDetails from './GeoScoreDetails';

interface GeoScorePanelProps {
  analysis: AnalysisResult;
  onUpdate: (a: AnalysisResult) => void;
}

const inputClass =
  'w-full px-3 py-2 bg-ts-surface border border-ts-border rounded-lg text-sm text-ts-text-primary placeholder:text-ts-text-secondary/60 focus:outline-none focus:border-ts-accent disabled:opacity-60';

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export default function GeoScorePanel({ analysis, onUpdate }: GeoScorePanelProps) {
  const existing = analysis.enrichments?.geo;
  const [brand, setBrand] = useState(existing?.brand ?? '');
  const [competitors, setCompetitors] = useState(
    existing?.competitors.map((c) => (c.domain ? `${c.name} (${c.domain})` : c.name)).join(', ') ?? '',
  );
  const [country, setCountry] = useState(existing?.country && existing.country !== 'GLOBAL' ? existing.country : '');
  const [queryCount, setQueryCount] = useState(existing?.queries.length || 20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!loading) return;
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => {
      clearInterval(id);
      setElapsed(0);
    };
  }, [loading]);

  const disabled = !analysis.id || loading;

  const run = async () => {
    if (!analysis.id) return;
    const competitorList = competitors
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 5);
    const countryCode = country.trim().toUpperCase();
    if (countryCode && !/^([A-Z]{2}|GLOBAL)$/.test(countryCode)) {
      setError('Country must be an ISO code like DE, US, GB – or GLOBAL.');
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{ ok: boolean; result: GeoScoreResult }>(
        `/api/analyses/${analysis.id}/enrich/geo`,
        {
          method: 'POST',
          signal: controller.signal,
          body: {
            ...(brand.trim() ? { brand: brand.trim() } : {}),
            ...(competitorList.length ? { competitors: competitorList } : {}),
            ...(countryCode ? { country: countryCode } : {}),
            queryCount: Math.min(40, Math.max(8, Math.round(queryCount) || 20)),
          },
        },
      );
      onUpdate({ ...analysis, enrichments: { ...(analysis.enrichments ?? {}), geo: data.result } });
    } catch (err) {
      if (!isAbortError(err)) setError(toErrorMessage(err, 'GEO score failed'));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  };

  return (
    <section id="section-geo">
      <div className="bg-ts-surface-card rounded-2xl border border-ts-border overflow-hidden">
        <div className="bg-gradient-to-br from-ts-accent/10 via-ts-surface-card to-adobe-red/5 p-4 sm:p-6 border-b border-ts-border">
          <h2 className="text-xl font-semibold text-ts-text-primary flex items-center gap-2">
            <Radar className="w-6 h-6 text-ts-accent" strokeWidth={1.5} />
            GEO Score · AI Visibility
          </h2>
          <p className="mt-1 text-sm text-ts-text-secondary max-w-2xl">
            How visible is the brand in AI-generated answers? Brand-free questions along the marketing funnel are answered
            by Claude and checked for brand and competitor mentions.
          </p>
        </div>

        <div className="p-4 sm:p-6 space-y-6">
          {!analysis.id ? (
            <p className="text-sm text-ts-text-secondary">
              GEO scoring is only available for saved analyses (database required).
            </p>
          ) : (
            <form
              className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
              onSubmit={(e) => {
                e.preventDefault();
                void run();
              }}
            >
              <label className="md:col-span-3 text-xs text-ts-text-secondary space-y-1">
                <span>Brand (optional)</span>
                <input className={inputClass} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="auto-detect" disabled={loading} maxLength={120} />
              </label>
              <label className="md:col-span-4 text-xs text-ts-text-secondary space-y-1">
                <span>Competitors (comma-separated, max 5)</span>
                <input
                  className={inputClass}
                  value={competitors}
                  onChange={(e) => setCompetitors(e.target.value)}
                  placeholder="auto-detect, e.g. Brand X (brandx.com), Brand Y"
                  disabled={loading}
                />
              </label>
              <label className="md:col-span-2 text-xs text-ts-text-secondary space-y-1">
                <span>Country</span>
                <input className={inputClass} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="auto (DE, US, GLOBAL)" disabled={loading} maxLength={6} />
              </label>
              <label className="md:col-span-1 min-w-0 text-xs text-ts-text-secondary space-y-1">
                <span className="block truncate"># Queries</span>
                <input
                  type="number"
                  min={8}
                  max={40}
                  className={inputClass}
                  value={queryCount}
                  onChange={(e) => setQueryCount(Number(e.target.value))}
                  disabled={loading}
                />
              </label>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={disabled}
                  className="w-full px-5 py-2.5 border border-ts-border text-ts-text-primary font-medium rounded-xl hover:border-ts-accent-light hover:bg-ts-surface-light transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Running…' : existing ? 'Re-run GEO Score' : 'Run GEO Score'}
                </button>
              </div>
              <p className="md:col-span-12 text-xs text-ts-text-secondary">
                Takes about 1–2 minutes ({queryCount || 20} Claude calls). Leave fields empty to auto-detect from the analysis.
              </p>
            </form>
          )}

          {loading && (
            <div className="flex items-center gap-3 text-sm text-ts-text-secondary">
              <Loader2 className="w-4 h-4 animate-spin text-adobe-red" />
              Generating funnel queries and asking Claude… {formatTime(elapsed)}
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl border border-adobe-red/40 bg-adobe-red/10 text-sm text-adobe-red whitespace-pre-line">{error}</div>
          )}

          {existing && !loading && <GeoScoreDetails result={existing} />}
        </div>
      </div>
    </section>
  );
}

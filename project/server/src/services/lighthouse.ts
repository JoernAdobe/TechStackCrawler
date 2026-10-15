import type {
  CoreWebVitals,
  LighthouseResult,
  LighthouseScores,
  LighthouseStrategyResult,
} from '../types/parity.js';

/**
 * Lighthouse-Scores über die Google PageSpeed Insights API v5
 * (https://developers.google.com/speed/docs/insights/v5/reference/pagespeedapi/runpagespeed).
 * Ersetzt die EAA-Variante (lokales Puppeteer + Lighthouse) durch einen API-Call.
 */

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const PSI_TIMEOUT_MS = 90_000;
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'] as const;
const MAX_OPPORTUNITIES = 5;

type Strategy = 'mobile' | 'desktop';

interface PsiAudit {
  id?: string;
  title?: string;
  numericValue?: number;
  details?: { type?: string; overallSavingsMs?: number };
}

interface PsiMetric {
  percentile?: number;
  category?: string;
}

interface PsiResponse {
  lighthouseResult?: {
    categories?: Record<string, { score?: number | null } | undefined>;
    audits?: Record<string, PsiAudit | undefined>;
  };
  loadingExperience?: {
    overall_category?: string;
    metrics?: Record<string, PsiMetric | undefined>;
  };
  error?: { code?: number; message?: string };
}

function toScore(score: unknown): number | null {
  return typeof score === 'number' && Number.isFinite(score) ? Math.round(score * 100) : null;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function round(value: number | undefined, digits = 0): number | undefined {
  if (value === undefined) return undefined;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** Reiner Parser für eine PSI-v5-Antwort (eine Strategie). Wirft bei API-Fehler-Payloads. */
export function parsePsiResponse(json: unknown): LighthouseStrategyResult {
  const data = (json ?? {}) as PsiResponse;
  if (data.error) {
    throw new Error(data.error.message || `PageSpeed Insights error ${data.error.code ?? ''}`.trim());
  }
  const lhr = data.lighthouseResult;
  if (!lhr) throw new Error('PageSpeed Insights response without lighthouseResult');

  const cats = lhr.categories ?? {};
  const scores: LighthouseScores = {
    performance: toScore(cats.performance?.score),
    accessibility: toScore(cats.accessibility?.score),
    bestPractices: toScore(cats['best-practices']?.score),
    seo: toScore(cats.seo?.score),
  };

  const audits = lhr.audits ?? {};
  const field = data.loadingExperience;
  const vitals: CoreWebVitals = {};
  const lcp = round(num(audits['largest-contentful-paint']?.numericValue));
  const cls = round(num(audits['cumulative-layout-shift']?.numericValue), 3);
  const fcp = round(num(audits['first-contentful-paint']?.numericValue));
  const tbt = round(num(audits['total-blocking-time']?.numericValue));
  const inp = num(field?.metrics?.INTERACTION_TO_NEXT_PAINT?.percentile);
  if (lcp !== undefined) vitals.lcpMs = lcp;
  if (cls !== undefined) vitals.cls = cls;
  if (fcp !== undefined) vitals.fcpMs = fcp;
  if (tbt !== undefined) vitals.tbtMs = tbt;
  if (inp !== undefined) vitals.inpMs = inp;
  if (field?.overall_category) vitals.fieldCategory = field.overall_category;

  const opportunities = Object.entries(audits)
    .filter(([, a]) => a?.details?.type === 'opportunity' && (num(a.details.overallSavingsMs) ?? 0) > 0)
    .map(([key, a]) => ({
      id: a?.id ?? key,
      title: a?.title ?? key,
      savingsMs: Math.round(a?.details?.overallSavingsMs ?? 0),
    }))
    .sort((a, b) => b.savingsMs - a.savingsMs)
    .slice(0, MAX_OPPORTUNITIES);

  return { scores, vitals, opportunities };
}

export function buildPsiUrl(url: string, strategy: Strategy, apiKey?: string): string {
  const params = new URLSearchParams({ url, strategy });
  for (const c of CATEGORIES) params.append('category', c);
  if (apiKey) params.set('key', apiKey);
  return `${PSI_ENDPOINT}?${params.toString()}`;
}

async function runStrategy(url: string, strategy: Strategy): Promise<LighthouseStrategyResult> {
  const res = await fetch(buildPsiUrl(url, strategy, process.env.PAGESPEED_API_KEY || undefined), {
    signal: AbortSignal.timeout(PSI_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error(`PageSpeed Insights HTTP ${res.status}`);
  }
  if (!res.ok && !(json as PsiResponse)?.error) throw new Error(`PageSpeed Insights HTTP ${res.status}`);
  return parsePsiResponse(json);
}

/** Rohe Google-Fehler (inkl. Projektnummern) in kurze, verständliche Texte übersetzen. */
export function friendlyPsiError(msg: string): string {
  if (/quota|rate limit|429/i.test(msg)) {
    return process.env.PAGESPEED_API_KEY
      ? 'Daily PageSpeed Insights quota exhausted – try again tomorrow.'
      : 'PageSpeed Insights quota exhausted (no API key configured). Set PAGESPEED_API_KEY on the server or try again later.';
  }
  if (/timeout|aborted/i.test(msg)) return 'PageSpeed Insights did not respond in time – please re-run.';
  if (/FAILED_DOCUMENT_REQUEST|ERRORED_DOCUMENT_REQUEST|unable to (?:process|load)/i.test(msg)) {
    return 'PageSpeed Insights could not load the page (blocked or unreachable for Google).';
  }
  return msg.replace(/'?project_number:\d+'?/g, '').slice(0, 200);
}

function errMsg(strategy: Strategy, reason: unknown): string {
  const msg = reason instanceof Error ? reason.message : String(reason);
  return `${strategy}: ${friendlyPsiError(msg)}`;
}

/** Führt PSI für Mobile und Desktop parallel aus. Wirft nicht – Fehler landen in `error`. */
export async function runLighthouse(url: string): Promise<LighthouseResult> {
  const [mobile, desktop] = await Promise.allSettled([
    runStrategy(url, 'mobile'),
    runStrategy(url, 'desktop'),
  ]);

  const result: LighthouseResult = {
    url,
    fetchedAt: new Date().toISOString(),
    source: 'pagespeed-insights',
  };
  const errors: string[] = [];
  if (mobile.status === 'fulfilled') result.mobile = mobile.value;
  else errors.push(errMsg('mobile', mobile.reason));
  if (desktop.status === 'fulfilled') result.desktop = desktop.value;
  else errors.push(errMsg('desktop', desktop.reason));
  // Gleiche Ursache für beide Strategien nur einmal anzeigen.
  const unique = [...new Set(errors.map((e) => e.replace(/^(mobile|desktop): /, '')))];
  if (errors.length) result.error = unique.length === 1 && errors.length === 2 ? unique[0] : errors.join(' | ');
  return result;
}

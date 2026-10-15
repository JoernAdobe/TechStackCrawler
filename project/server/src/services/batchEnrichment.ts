/**
 * Optionale Enrichments pro Batch-Item (Account-/Bulk-Assessment).
 * Nutzt ausschließlich die bestehenden Enrichment-Funktionen der Einzelanalyse;
 * jede Quelle ist fehlerisoliert, gedrosselt und – falls teuer/quotiert – budgetiert.
 */
import { getTraffic as realGetTraffic } from './traffic.js';
import { runLighthouse as realRunLighthouse } from './lighthouse.js';
import { findMobileApps as realFindMobileApps, type FindMobileAppsInput } from './mobileApps.js';
import { runGeoScore as realRunGeoScore, type GeoScoreOptions } from './geoScore.js';
import { discoverUseCases as realDiscoverUseCases } from './useCaseDiscovery.js';
import { getObservePoint, isObservePointConfigured, ObservePointError } from './observepoint/index.js';
import { getTagLibrary } from './observepoint/client.js';
import { buildEvidenceMatrix, observePointCoverage } from './evidenceMatrix.js';
import {
  compactGeo,
  compactLighthouse,
  compactMobileApps,
  compactObservePoint,
  compactTraffic,
  compactUseCases,
} from './batchEnrichmentCompact.js';
import type { AnalysisResult, DetectedTechnology, UseCaseDiscoveryResult } from '../types/analysis.js';
import type {
  AnalysisEnrichments,
  EvidenceMatrix,
  GeoScoreResult,
  LighthouseResult,
  MobileAppsResult,
  ObservePointResult,
  TrafficResult,
  BatchKind,
} from '../types/parity.js';
import type {
  BatchEnrichmentOptions,
  BatchEnrichmentSource,
  BatchItemEnrichments,
} from '../types/batchAccount.js';

export const COSTLY_SOURCES: BatchEnrichmentSource[] = ['lighthouse', 'semrush', 'geo', 'useCases'];
export const MAX_COSTLY_ITEMS_LIMIT = 50;

/** Sinnvolle Defaults: günstige Quellen an, teure/quotierte aus. */
export function resolveEnrichmentOptions(
  kind: BatchKind,
  aiAnalysis: boolean,
  partial: Partial<BatchEnrichmentOptions> = {},
): BatchEnrichmentOptions {
  const defaults: BatchEnrichmentOptions = {
    traffic: true,
    semrush: false,
    observepoint: true,
    mobileApps: kind === 'account',
    lighthouse: false,
    geo: false,
    useCases: false,
    multiPage: false,
    maxCostlyItems: kind === 'account' ? 10 : 5,
  };
  const merged = { ...defaults, ...Object.fromEntries(Object.entries(partial).filter(([, v]) => v !== undefined)) };
  const max = Math.floor(Number(merged.maxCostlyItems));
  return {
    ...merged,
    // Use Cases brauchen eine volle KI-Analyse als Basis.
    useCases: merged.useCases && aiAnalysis,
    maxCostlyItems: Number.isFinite(max) ? Math.min(Math.max(max, 1), MAX_COSTLY_ITEMS_LIMIT) : defaults.maxCostlyItems,
  } as BatchEnrichmentOptions;
}

export function hasAnyEnrichment(o: BatchEnrichmentOptions): boolean {
  return o.traffic || o.semrush || o.observepoint || o.mobileApps || o.lighthouse || o.geo || o.useCases;
}

/** Laufzeitzustand pro Batch: verbrauchtes Budget und (z. B. wegen Quota) abgeschaltete Quellen. */
export interface BatchEnrichmentState {
  used: Partial<Record<BatchEnrichmentSource, number>>;
  disabled: Partial<Record<BatchEnrichmentSource, string>>;
}

export function createEnrichmentState(): BatchEnrichmentState {
  return { used: {}, disabled: {} };
}

export interface EnrichmentDeps {
  getTraffic(url: string, opts: { semrush: boolean }): Promise<TrafficResult>;
  runLighthouse(url: string): Promise<LighthouseResult>;
  observePointConfigured(): boolean;
  semrushConfigured(): boolean;
  getObservePoint(url: string): Promise<ObservePointResult>;
  getOpCoverage(): Promise<Set<string>>;
  findMobileApps(input: FindMobileAppsInput): Promise<MobileAppsResult>;
  runGeoScore(analysis: AnalysisResult, opts: GeoScoreOptions): Promise<GeoScoreResult>;
  discoverUseCases(analysis: AnalysisResult): Promise<{ result: UseCaseDiscoveryResult; sitemapUrls: string[] }>;
  /** Vor jedem Aufruf einer Quelle (Rate-Limit). */
  throttle(source: BatchEnrichmentSource): Promise<void>;
  timeoutMs(source: BatchEnrichmentSource): number;
}

/** Serialisiert Aufrufe und hält einen Mindestabstand ein (z. B. Tranco: 1 Anfrage/Sekunde). */
export function createThrottle(minIntervalMs: number, now: () => number = Date.now) {
  let chain: Promise<void> = Promise.resolve();
  let last = 0;
  return (): Promise<void> => {
    const next = chain.then(async () => {
      const wait = last + minIntervalMs - now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = now();
    });
    chain = next.catch(() => undefined);
    return next;
  };
}

const THROTTLE_MS: Record<BatchEnrichmentSource, number> = {
  traffic: 1100,
  semrush: 1000,
  observepoint: 500,
  mobileApps: 3000,
  lighthouse: 1500,
  geo: 0,
  useCases: 0,
  multiPage: 0,
};
const TIMEOUT_MS: Record<BatchEnrichmentSource, number> = {
  traffic: 45_000,
  semrush: 45_000,
  observepoint: 120_000,
  mobileApps: 45_000,
  lighthouse: 150_000,
  geo: 360_000,
  useCases: 240_000,
  multiPage: 0,
};
const throttles = new Map<BatchEnrichmentSource, () => Promise<void>>();

export const defaultEnrichmentDeps: EnrichmentDeps = {
  getTraffic: (url, opts) => realGetTraffic(url, opts),
  runLighthouse: realRunLighthouse,
  observePointConfigured: isObservePointConfigured,
  semrushConfigured: () => Boolean(process.env.SEMRUSH_API_KEY?.trim()),
  getObservePoint: (url) => getObservePoint(url, 'reuse'),
  getOpCoverage: async () => observePointCoverage(await getTagLibrary()),
  findMobileApps: realFindMobileApps,
  runGeoScore: realRunGeoScore,
  discoverUseCases: realDiscoverUseCases,
  throttle: (source) => {
    let t = throttles.get(source);
    if (!t) throttles.set(source, (t = createThrottle(THROTTLE_MS[source])));
    return t();
  },
  timeoutMs: (source) => TIMEOUT_MS[source],
};

class SourceTimeoutError extends Error {
  constructor(source: string) {
    super(`${source} timed out`);
    this.name = 'TimeoutError';
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, source: string): Promise<T> {
  if (!ms) return p;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new SourceTimeoutError(source)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Kurze, sichere Fehlermeldung (keine Keys/URLs mit Query-Parametern, max. 160 Zeichen). */
export function friendlySourceError(source: BatchEnrichmentSource, err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  const msg = err instanceof Error ? err.message : String(err);
  if (name === 'TimeoutError' || /timeout|timed out|aborted/i.test(msg)) return `${source}: no response in time`;
  if (/429|rate limit/i.test(msg)) return `${source}: rate-limited – try again later`;
  if (/quota|units balance|limit exceeded/i.test(msg)) return `${source}: quota exhausted`;
  return msg
    .replace(/https?:\/\/\S+/g, '[url]')
    .replace(/(key|token|apikey|api_key)=\S+/gi, '$1=***')
    .slice(0, 160);
}

export interface EnrichmentItemInput {
  url: string;
  label?: string;
  lens?: string;
  detections: DetectedTechnology[];
  /** Volle Analyse (KI-Modus) – Basis für GEO/Use Cases und Ziel der Persistenz. */
  analysis?: AnalysisResult;
  html?: string;
  bodyText?: string;
}

export interface EnrichmentOutcome {
  compact: BatchItemEnrichments;
  /** Volle Ergebnisse zum Speichern in der Einzelanalyse (falls analysisId vorhanden). */
  full: AnalysisEnrichments;
  useCaseDiscovery?: UseCaseDiscoveryResult;
  sitemapUrls?: string[];
}

type Gate = { run: true } | { run: false; reason?: string };

function gate(
  source: BatchEnrichmentSource,
  options: BatchEnrichmentOptions,
  state: BatchEnrichmentState,
  out: BatchItemEnrichments,
): Gate {
  if (!options[source as keyof BatchEnrichmentOptions]) return { run: false };
  const disabled = state.disabled[source];
  if (disabled) {
    (out.skipped ??= {})[source] = disabled;
    return { run: false, reason: disabled };
  }
  if (COSTLY_SOURCES.includes(source)) {
    const used = state.used[source] ?? 0;
    if (used >= options.maxCostlyItems) {
      (out.skipped ??= {})[source] = `Limit of ${options.maxCostlyItems} items reached`;
      return { run: false };
    }
    state.used[source] = used + 1;
  }
  return { run: true };
}

function syntheticAnalysis(input: EnrichmentItemInput): AnalysisResult {
  return {
    url: input.url,
    analyzedAt: new Date().toISOString(),
    summary: '',
    categories: [],
    rawDetections: input.detections,
    ...(input.bodyText ? { pageContentExcerpt: input.bodyText.slice(0, 12000) } : {}),
  };
}

/**
 * Führt die konfigurierten Enrichments für ein Item aus. Wirft nie – Fehler je Quelle
 * landen in `compact.errors`, bewusst ausgelassene Quellen in `compact.skipped`.
 */
export async function runItemEnrichments(
  input: EnrichmentItemInput,
  options: BatchEnrichmentOptions,
  state: BatchEnrichmentState,
  deps: EnrichmentDeps = defaultEnrichmentDeps,
): Promise<EnrichmentOutcome> {
  const compact: BatchItemEnrichments = {};
  const full: AnalysisEnrichments = {};
  const outcome: EnrichmentOutcome = { compact, full };

  const call = async <T>(source: BatchEnrichmentSource, fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      await deps.throttle(source);
      return await withTimeout(fn(), deps.timeoutMs(source), source);
    } catch (err) {
      const message = friendlySourceError(source, err);
      (compact.errors ??= {})[source] = message;
      if (err instanceof ObservePointError && (err.status === 401 || err.status === 403 || err.local)) {
        state.disabled.observepoint = 'ObservePoint access failed – skipped for the rest of this batch';
      }
      if (/quota exhausted/.test(message)) state.disabled[source] = message;
      return undefined;
    }
  };

  // Phase 1 (parallel, unabhängige Dienste): Traffic, ObservePoint, Mobile Apps, Lighthouse.
  const phase1: Array<Promise<void>> = [];

  const trafficGate = gate('traffic', options, state, compact);
  let semrushGate: Gate = { run: false };
  if (options.semrush && !deps.semrushConfigured()) {
    (compact.skipped ??= {}).semrush = 'SEMRUSH_API_KEY not configured';
  } else {
    semrushGate = gate('semrush', options, state, compact);
  }
  if (trafficGate.run || semrushGate.run) {
    phase1.push(
      (async () => {
        const t = await call(semrushGate.run ? 'semrush' : 'traffic', () =>
          deps.getTraffic(input.url, { semrush: semrushGate.run }),
        );
        if (!t) return;
        full.traffic = t;
        compact.traffic = compactTraffic(t);
        const semrushIssue = t.notes?.find((n) => /semrush/i.test(n) && /units|limit|quota|ERROR 13/i.test(n));
        if (semrushIssue) state.disabled.semrush = 'Semrush quota/limit reached – skipped for the rest of this batch';
        if (semrushGate.run && !t.sources.includes('semrush')) {
          (compact.errors ??= {}).semrush = friendlySourceError('semrush', t.notes?.find((n) => /semrush/i.test(n)) ?? 'no data');
        }
      })(),
    );
  }

  let observepoint: ObservePointResult | undefined;
  if (options.observepoint && !deps.observePointConfigured()) {
    (compact.skipped ??= {}).observepoint = 'ObservePoint is not configured';
  } else if (gate('observepoint', options, state, compact).run) {
    phase1.push(
      (async () => {
        const res = await call('observepoint', async () => {
          const [op, coverage] = await Promise.all([deps.getObservePoint(input.url), deps.getOpCoverage()]);
          return { op, coverage };
        });
        if (!res) return;
        observepoint = res.op;
        const evidenceMatrix: EvidenceMatrix = buildEvidenceMatrix({ detections: input.detections, observepoint: res.op, opCoverage: res.coverage });
        full.observepoint = res.op;
        full.evidenceMatrix = evidenceMatrix;
        compact.observepoint = compactObservePoint(res.op, res.op.status === 'done' ? evidenceMatrix : undefined);
      })(),
    );
  }

  if (gate('mobileApps', options, state, compact).run) {
    phase1.push(
      (async () => {
        const brand = input.lens === 'Brand' ? input.label : undefined;
        const m = await call('mobileApps', () => deps.findMobileApps({ url: input.url, html: input.html, brand }));
        if (!m) return;
        full.mobileApps = m;
        compact.mobileApps = compactMobileApps(m);
      })(),
    );
  }

  if (gate('lighthouse', options, state, compact).run) {
    phase1.push(
      (async () => {
        const l = await call('lighthouse', () => deps.runLighthouse(input.url));
        if (!l) return;
        full.lighthouse = l;
        const c = compactLighthouse(l);
        if (c) compact.lighthouse = c;
        if (l.error) {
          (compact.errors ??= {}).lighthouse = l.error.slice(0, 200);
          // friendlyPsiError liefert bei Quota "quota exhausted" → Rest des Batches überspringen.
          if (!c && /quota/i.test(l.error)) state.disabled.lighthouse = l.error.slice(0, 200);
        }
      })(),
    );
  }

  await Promise.all(phase1);

  // Phase 2 (LLM, baut auf Phase-1-Ergebnissen auf): GEO und Use Cases.
  const base: AnalysisResult = input.analysis ?? syntheticAnalysis(input);
  const enriched: AnalysisResult = {
    ...base,
    enrichments: { ...(base.enrichments ?? {}), ...full, ...(observepoint ? { observepoint } : {}) },
  };
  const phase2: Array<Promise<void>> = [];

  if (gate('geo', options, state, compact).run) {
    phase2.push(
      (async () => {
        const brand = input.lens === 'Brand' ? input.label : undefined;
        const g = await call('geo', () => deps.runGeoScore(enriched, { brand }));
        if (!g) return;
        full.geo = g;
        compact.geo = compactGeo(g);
      })(),
    );
  }

  if (options.useCases && !input.analysis) {
    (compact.skipped ??= {}).useCases = 'Requires full AI analysis';
  } else if (gate('useCases', options, state, compact).run) {
    phase2.push(
      (async () => {
        const u = await call('useCases', () => deps.discoverUseCases(enriched));
        if (!u) return;
        outcome.useCaseDiscovery = u.result;
        outcome.sitemapUrls = u.sitemapUrls;
        compact.useCases = compactUseCases(u.result);
      })(),
    );
  }

  await Promise.all(phase2);
  return outcome;
}

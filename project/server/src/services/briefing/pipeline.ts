/**
 * Client Pre-Briefing – powered by Chris Whitehead.
 * Recherche + Abschnitte + Executive Summary für eine bestehende Analyse.
 *
 * VERTRAG (Signatur nicht ändern): wird von queue.ts aufgerufen.
 * Ablauf: Kunde identifizieren → Register-Dossier → Abschnitte (max. 3 parallel, s14 zuletzt
 * mit den Ergebnissen der übrigen) → Executive Summary. Abbruch über input.signal.
 */
import type { AnalysisResult } from '../../types/analysis.js';
import {
  BRIEFING_SECTIONS,
  type BriefingProgress,
  type BriefingSection,
  type BriefingSectionId,
  type BriefingUsage,
  type ExecutiveSummary,
} from '../../types/briefing.js';
import type { LlmCallOptions } from '../llmCall.js';
import { loadBriefingAssets, type BriefingAssets } from './assets.js';
import { SCAN_SECTIONS, scanSource, techFactsFor } from './context.js';
import { buildExecutiveSummary } from './executiveLlm.js';
import { bedrockCreate, throwIfAborted, type LlmCreate, type ModelContext } from './llm.js';
import { identifyCompany } from './research/company.js';
import { buildDossier } from './research/dossier.js';
import { createPageFetcher, type PageFetcher } from './research/fetchPage.js';
import { defaultHttpGet, type HttpGet } from './research/http.js';
import { SourceLedger } from './research/ledger.js';
import { createDuckDuckGoSearch, type SearchEngine } from './research/search.js';
import { clientKey as toClientKey } from './research/text.js';
import { ResearchSession } from './research/toolbox.js';
import { summarizeSection } from './sections/summary.js';
import { writeSection } from './sections/writer.js';
import { UsageTracker } from './usage.js';

export interface BriefingPipelineInput {
  jobId: number;
  analysis: AnalysisResult;
  /** Gewählte Abschnitte in Reihenfolge, enthält immer 's14'. */
  sections: BriefingSectionId[];
  signal: AbortSignal;
  onProgress: (p: BriefingProgress) => void;
  /** Bereits gespeicherte Abschnitte (Resume nach Neustart) – werden nicht neu recherchiert. */
  resumeSections?: BriefingSection[];
  /** Wird nach jedem fertigen Abschnitt aufgerufen (Checkpoint in der DB). */
  onSectionDone?: (section: BriefingSection) => Promise<void> | void;
}

export interface BriefingPipelineOutput {
  companyName: string;
  domain: string;
  clientDomains: string[];
  sections: BriefingSection[];
  executive: ExecutiveSummary;
  usage: BriefingUsage;
}

/** Austauschbare Abhängigkeiten (Tests injizieren Fakes; produktiv Bedrock + echte Recherche). */
export interface BriefingPipelineDeps {
  create: LlmCreate;
  httpGet: HttpGet;
  search: SearchEngine;
  fetcher: PageFetcher;
  assets: BriefingAssets;
  concurrency: number;
  now: () => Date;
  llmOptions?: LlmCallOptions;
}

const SECTION_CONCURRENCY = Math.max(1, Number(process.env.BRIEFING_SECTION_CONCURRENCY) || 3);

function resolveDeps(overrides: Partial<BriefingPipelineDeps>): BriefingPipelineDeps {
  const httpGet = overrides.httpGet ?? defaultHttpGet;
  return {
    create: overrides.create ?? bedrockCreate,
    httpGet,
    search: overrides.search ?? createDuckDuckGoSearch({ httpGet }),
    fetcher: overrides.fetcher ?? createPageFetcher({ httpGet }),
    assets: overrides.assets ?? loadBriefingAssets(),
    concurrency: overrides.concurrency ?? SECTION_CONCURRENCY,
    now: overrides.now ?? (() => new Date()),
    llmOptions: overrides.llmOptions,
  };
}

function errorSection(id: BriefingSectionId, err: unknown): BriefingSection {
  const meta = BRIEFING_SECTIONS.find((s) => s.id === id)!;
  const msg = err instanceof Error ? err.message : String(err);
  return { id, title: meta.title, eyebrow: meta.eyebrow, status: 'error', blocks: [], sources: [], gaps: [`Section could not be generated (${msg.slice(0, 200)}).`] };
}

/** Einfacher Worker-Pool: höchstens `limit` Aufgaben gleichzeitig. */
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const run = async () => {
    while (next < items.length) await worker(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

export async function runBriefingPipelineWith(
  input: BriefingPipelineInput,
  overrides: Partial<BriefingPipelineDeps> = {},
): Promise<BriefingPipelineOutput> {
  const deps = resolveDeps(overrides);
  const { analysis, signal, onProgress } = input;
  const selected = [...new Set<BriefingSectionId>([...input.sections, 's14'])].filter((id) => BRIEFING_SECTIONS.some((s) => s.id === id));
  const usage = new UsageTracker();
  const model: ModelContext = { create: deps.create, usage, signal, llmOptions: deps.llmOptions };
  const today = deps.now();
  throwIfAborted(signal);

  const profile = await identifyCompany(analysis, { httpGet: deps.httpGet, model });
  for (const note of profile.notes) console.warn(`Briefing job ${input.jobId}: ${note}`);
  const ledger = new SourceLedger();
  const dossier = buildDossier(profile, ledger);
  const key = toClientKey(profile.companyName);
  const research = new ResearchSession({ search: deps.search, fetcher: deps.fetcher }, ledger, usage, profile.clientDomains, key);
  const scan = scanSource(analysis);
  const results = new Map<BriefingSectionId, BriefingSection>();

  const resumed = new Map(
    (input.resumeSections ?? [])
      .filter((sec) => sec.status === 'done' || sec.status === 'thin')
      .map((sec) => [sec.id, sec] as const),
  );

  const runSection = async (id: BriefingSectionId, otherSections?: string) => {
    throwIfAborted(signal);
    const saved = resumed.get(id);
    if (saved) {
      results.set(id, saved);
      onProgress({ step: id, state: saved.status, message: 'Restored from checkpoint' });
      return;
    }
    let section: BriefingSection;
    try {
      section = await writeSection(
        {
          sectionId: id,
          companyName: profile.companyName,
          domain: profile.domain,
          clientDomains: profile.clientDomains,
          dossier,
          techFacts: techFactsFor(id, analysis),
          otherSections,
          today,
        },
        {
          model,
          research,
          ledger,
          assets: deps.assets,
          clientKey: key,
          scanSource: SCAN_SECTIONS.includes(id) ? scan : undefined,
          onState: (state, message) => onProgress({ step: id, state, ...(message ? { message } : {}) }),
          now: today,
        },
      );
    } catch (err) {
      throwIfAborted(signal);
      console.error(`Briefing job ${input.jobId}: section ${id} failed:`, err instanceof Error ? err.message : err);
      section = errorSection(id, err);
    }
    results.set(id, section);
    if (section.status !== 'error' && input.onSectionDone) {
      try {
        await input.onSectionDone(section);
      } catch (err) {
        console.error(`Briefing job ${input.jobId}: checkpoint for ${id} failed:`, err instanceof Error ? err.message : err);
      }
    }
    const lastGap = section.gaps[section.gaps.length - 1];
    onProgress({ step: id, state: section.status, ...(section.status !== 'done' && lastGap ? { message: lastGap.slice(0, 200) } : {}) });
  };

  const regular = selected.filter((id) => id !== 's14');
  await runPool(regular, deps.concurrency, (id) => runSection(id));
  throwIfAborted(signal);
  const others = regular.map((id) => summarizeSection(results.get(id)!)).join('\n\n');
  await runSection('s14', others || 'No other sections were selected – ground recommendations in the dossier and TechStack Analyzer facts.');
  throwIfAborted(signal);

  const sections = selected.map((id) => results.get(id)!);
  onProgress({ step: 'executive', state: 'writing' });
  const executive = await buildExecutiveSummary({ companyName: profile.companyName, analysis, sections, model });
  throwIfAborted(signal);
  onProgress({ step: 'executive', state: 'done', message: `Overall score ${executive.overallScore ?? 'n/a'} (${executive.confidence} confidence)` });

  return {
    companyName: profile.companyName,
    domain: profile.domain,
    clientDomains: profile.clientDomains,
    sections,
    executive,
    usage: usage.snapshot(),
  };
}

export async function runBriefingPipeline(input: BriefingPipelineInput): Promise<BriefingPipelineOutput> {
  return runBriefingPipelineWith(input);
}

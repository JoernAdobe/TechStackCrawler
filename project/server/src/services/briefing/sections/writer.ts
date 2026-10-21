/**
 * Abschnitts-Writer: Bedrock-Tool-Use-Schleife (web_search, fetch_page, submit_section) mit
 * Budget (max. 8 Recherche-Aufrufe, danach erzwungenes submit) und bis zu zwei Nachbesserungen.
 */
import { BRIEFING_SECTIONS, type BriefingSection, type BriefingSectionProgressState, type BriefingSource } from '../../../types/briefing.js';
import type { BriefingAssets } from '../assets.js';
import { callModel, type LlmContent, type LlmMessage, type LlmTool, type ModelContext } from '../llm.js';
import type { SourceLedger } from '../research/ledger.js';
import type { ResearchSession } from '../research/toolbox.js';
import { finalizeSection, MIN_SOURCES, resolveSources } from './guardrail.js';
import { normalizeBlocks, normalizeGaps, structuralIssues, SUBMIT_SECTION_TOOL } from './normalize.js';
import { buildSystemPrompt, buildUserPrompt, MAX_RESEARCH_CALLS, type SectionPromptInput } from './prompts.js';

const MAX_TURNS = 14;
const MAX_REPAIRS = 2;

const RESEARCH_TOOLS: LlmTool[] = [
  {
    name: 'web_search',
    description: 'Search the web (DuckDuckGo). Returns up to 8 results with title, URL and snippet. Use specific queries, e.g. "<company> annual report 2025 revenue".',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'fetch_page',
    description: 'Fetch a web page and return its readable text (max 8,000 chars) and publication date. PDFs, people-data aggregators and LinkedIn are not supported.',
    input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  },
];

export interface SectionWriterDeps {
  model: ModelContext;
  research: ResearchSession;
  ledger: SourceLedger;
  assets: BriefingAssets;
  clientKey: string;
  scanSource?: BriefingSource;
  onState: (state: BriefingSectionProgressState, message?: string) => void;
  now?: Date;
}

async function runResearchTool(research: ResearchSession, name: string, input: unknown): Promise<{ text: string; isError: boolean }> {
  const args = (input ?? {}) as Record<string, unknown>;
  if (name === 'web_search' && typeof args.query === 'string' && args.query.trim()) return research.webSearch(args.query.trim().slice(0, 300));
  if (name === 'fetch_page' && typeof args.url === 'string' && /^https?:\/\//i.test(args.url.trim())) return research.fetchPage(args.url.trim());
  return { text: `Invalid call to ${name}: missing or malformed argument.`, isError: true };
}

export async function writeSection(input: SectionPromptInput, deps: SectionWriterDeps): Promise<BriefingSection> {
  const meta = BRIEFING_SECTIONS.find((s) => s.id === input.sectionId)!;
  const system = buildSystemPrompt(deps.assets, input.sectionId);
  const messages: LlmMessage[] = [{ role: 'user', content: buildUserPrompt(input) }];
  const tools = [...RESEARCH_TOOLS, SUBMIT_SECTION_TOOL];
  let researchCalls = 0;
  let repairs = 0;
  let forceSubmit = false;
  let writing = false;
  let lastDraft: BriefingSection | null = null;

  deps.onState('researching');
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const mustSubmit = forceSubmit || researchCalls >= MAX_RESEARCH_CALLS;
    if (mustSubmit && !writing) {
      writing = true;
      deps.onState('writing');
    }
    const res = await callModel(deps.model, `briefing.${input.sectionId}`, {
      system,
      messages,
      tools,
      tool_choice: mustSubmit ? { type: 'tool', name: SUBMIT_SECTION_TOOL.name } : { type: 'auto' },
      max_tokens: 8_192,
      temperature: 0.2,
    });
    messages.push({ role: 'assistant', content: res.content });
    const toolUses = res.content.filter((c): c is Extract<LlmContent, { type: 'tool_use' }> => c.type === 'tool_use');

    const submit = toolUses.find((t) => t.name === SUBMIT_SECTION_TOOL.name);
    if (submit) {
      if (!writing) {
        writing = true;
        deps.onState('writing');
      }
      const raw = (submit.input ?? {}) as Record<string, unknown>;
      const blocks = normalizeBlocks(raw.blocks, input.sectionId);
      const resolved = resolveSources(raw.sources, {
        sectionId: input.sectionId,
        ledger: deps.ledger,
        clientDomains: input.clientDomains,
        clientKey: deps.clientKey,
        scanSource: deps.scanSource,
        now: deps.now,
      });
      const draft = finalizeSection(input.sectionId, meta.title, meta.eyebrow, { blocks, gaps: normalizeGaps(raw.gaps), resolved });
      lastDraft = draft;
      const issues = structuralIssues(blocks, input.sectionId);
      if (resolved.sources.length < MIN_SOURCES && researchCalls < MAX_RESEARCH_CALLS) {
        issues.push(`Only ${resolved.sources.length} citable source(s) remain after verification${resolved.dropped.length ? ` (dropped: ${resolved.dropped.slice(0, 5).join('; ')})` : ''}. Fetch or find more sources, or cite the ones you actually retrieved.`);
      }
      if (!issues.length || repairs >= MAX_REPAIRS) return draft;
      repairs++;
      // Weitere Recherche nur, wenn Quellen fehlen und Budget übrig ist; sonst direkt neu einreichen.
      forceSubmit = !(resolved.sources.length < MIN_SOURCES && researchCalls < MAX_RESEARCH_CALLS);
      messages.push({
        role: 'user',
        content: [
          ...toolUses
            .filter((t) => t !== submit)
            .map((t) => ({ type: 'tool_result' as const, tool_use_id: t.id, content: 'Not executed (section was submitted).', is_error: true })),
          { type: 'tool_result', tool_use_id: submit.id, content: `Submission rejected:\n- ${issues.join('\n- ')}\nFix these and call submit_section again.`, is_error: true },
        ],
      });
      continue;
    }

    if (!toolUses.length) {
      forceSubmit = true;
      messages.push({ role: 'user', content: 'Call submit_section now with the section content, sources and gaps.' });
      continue;
    }

    const results: LlmContent[] = [];
    for (const t of toolUses) {
      if (researchCalls >= MAX_RESEARCH_CALLS) {
        results.push({ type: 'tool_result', tool_use_id: t.id, content: 'Research budget exhausted. Submit the section now.', is_error: true });
        continue;
      }
      researchCalls++;
      const r = await runResearchTool(deps.research, t.name, t.input);
      results.push({ type: 'tool_result', tool_use_id: t.id, content: r.text, ...(r.isError ? { is_error: true } : {}) });
    }
    messages.push({ role: 'user', content: results });
  }
  if (lastDraft) return lastDraft;
  throw new Error(`section ${input.sectionId}: no submission after ${MAX_TURNS} turns`);
}

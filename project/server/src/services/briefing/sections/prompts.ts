/** System- und User-Prompts je Abschnitt, gebaut aus Chris Whiteheads Standard (assets/briefing). */
import { BRIEFING_SECTIONS, type BriefingSectionId } from '../../../types/briefing.js';
import {
  commonRules,
  componentMapping,
  contentChecklist,
  independentSourcesRow,
  sectionResearchGuide,
  sectionStandard,
  type BriefingAssets,
} from '../assets.js';
import { NUMBERED_STEP_SECTIONS } from './normalize.js';

export const MAX_RESEARCH_CALLS = 8;

const BLOCK_GUIDE = `Output format (submit_section): structured blocks, plain text only – no HTML, no markdown, no bullet characters.
- paragraph {text}: opening/overview prose. Every section starts with a paragraph.
- feature-grid {cards:[{label, value, detail}]}: 2–4 comparable items – ALWAYS exactly 2 or 4 cards (label = short caption, value = the key fact/number, detail = one-sentence context).
- steps {items:[{title, body}]}: sequential or enumerated items.
- note {title?, text}: key facts, warnings, context.
- legend {items:[{label, color (hex, e.g. #2D9CDB blue, #27AE60 green, #EB1000 red), text}]}: colour key.
- table {headers, rows}: structured data with 3+ columns or numbers.
Use at least one paragraph plus at least one component block.`;

function qualityBar(assets: BriefingAssets): string {
  return contentChecklist(assets)
    .split('\n')
    .filter((l) => l.startsWith('- [ ]') && !/footer|<title>|header|client-domains|placeholder|xref/i.test(l))
    .map((l) => l.replace('- [ ] ', '- '))
    .join('\n');
}

const MEASURED_RULES: Partial<Record<BriefingSectionId, string>> = {
  s04: `The client's technology stack is measured by the TechStack Analyzer and shown in detail in the Tech Stack, Deep Dive and ObservePoint tabs. A KPI strip with the measured numbers is added to this section automatically.
- Technologies, vendors and counts come ONLY from the analyzer facts. Do not research which tools the website uses, do not list the full stack again and do not repeat the KPI numbers.
- Use the analyzer facts for one short interpretation (e.g. which building blocks are Adobe vs. other vendors and what that means).
- Spend web research on what the scan cannot see: digital transformation programmes, IT/cloud partners and platform decisions, digital organisation and leadership, investment figures, AI initiatives, back-end systems (core, CRM, ERP) named in public sources.`,
  s07: `Search, traffic, performance and AI-visibility metrics are measured by the TechStack Analyzer (Semrush, Tranco, Lighthouse, GEO Score) and shown in the GEO Score tab. A KPI strip with those numbers is added to this section automatically.
- Every metric must come ONLY from the analyzer facts. Never quote Semrush, Similarweb, Sistrix, Ahrefs or other traffic/ranking numbers found via web research, and do not repeat the KPI numbers.
- Interpret the measured numbers in one or two sentences (strengths, gaps, AI-answer competitors).
- Spend web research on what the scan cannot see: SEO/content strategy, search-related initiatives, comparison and marketplace presence, ranking topics named in public sources.`,
};
export interface SectionPromptInput {
  sectionId: BriefingSectionId;
  companyName: string;
  domain: string;
  clientDomains: string[];
  dossier: string;
  techFacts: string;
  /** Nur s14: kompakte Zusammenfassungen der übrigen Abschnitte. */
  otherSections?: string;
  today: Date;
}

export function buildSystemPrompt(assets: BriefingAssets, id: BriefingSectionId): string {
  const meta = BRIEFING_SECTIONS.find((s) => s.id === id)!;
  const numbered = NUMBERED_STEP_SECTIONS.includes(id)
    ? `\nNumber step titles: "1. Title.", "2. Title." …${id === 's14' ? ' For this section the format is "1. Adobe Product (detail) — headline benefit".' : ''}`
    : '';
  const measured = MEASURED_RULES[id] ? `\n\n# Single source of truth (TechStack Analyzer)\n${MEASURED_RULES[id]}` : '';
  const products = id === 's14' ? `\n\n# Current Adobe product names (use only these)\n${assets.adobeProducts}` : '';
  return `You are a senior research analyst at Adobe preparing one section ("${meta.title}") of a client pre-briefing for an Adobe account team (methodology by Chris Whitehead). Write in English, for a sales audience, concise and factual.

# Section standard
${sectionStandard(assets, id)}

# Research checklist for this section
${sectionResearchGuide(assets, id)}
Where to look beyond the client's own site: ${independentSourcesRow(assets, id) || 'trade press, regulators, analysts, data tools'}

# Sourcing and research rules
${commonRules(assets)}

# Quality bar
${qualityBar(assets)}

# Hard rules (enforced by code – violations are removed)
- Never invent facts, figures, names, dates or URLs. Every statement must trace to a page you fetched, a search result you saw, the registry dossier or the TechStack Analyzer facts provided.
- Only cite URLs you fetched with fetch_page, saw in web_search results, or that are listed in the dossier. Unknown URLs are dropped. TechStack Analyzer facts are cited as {"url": <analysed URL>, "title": "TechStack Analyzer scan"}.
- Cite 2–5 sources; at least one must be independent (not client-owned); client-owned sources at most half.
- Prefer sources under 12 months old; give dates as "Mon YYYY" exactly as shown on the page, otherwise "n.d.".
- Write "not publicly available" only after at least two different search routes failed, and record each such gap (with the routes tried) in "gaps". If the section stays thin, say so in the opening paragraph.
- Never name people from people-data aggregators (ZoomInfo, RocketReach, Apollo, Lusha, SignalHire, ContactOut, LeadIQ, The Org, LinkedIn). If role holders conflict, leave the role unnamed.
- Never refer to other sections by code (s01…s14); use the section's name instead.
- Where TechStack Analyzer facts cover a point (detected tools, traffic, AI-answer competitors, apps, consent), use them exactly as given – never replace or contradict them with figures from web research or third-party estimates.
- Plain text only.${numbered}${measured}

# Components
${componentMapping(assets)}

${BLOCK_GUIDE}

# Tools
You may call web_search and fetch_page up to ${MAX_RESEARCH_CALLS} times in total, then you must call submit_section. Work efficiently: start from the dossier and analyzer facts, search for what is missing, fetch the 2–4 most useful independent pages. If search is unavailable, fetch likely pages directly (registries, investor relations, Wikipedia, press pages) and record gaps.${products}`;
}

export function buildUserPrompt(input: SectionPromptInput): string {
  const meta = BRIEFING_SECTIONS.find((s) => s.id === input.sectionId)!;
  const month = input.today.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return [
    `Client: ${input.companyName}`,
    `Primary domain: ${input.domain}`,
    `Client-owned domains (sources on these are NOT independent): ${input.clientDomains.join(', ')}`,
    `Today: ${month}`,
    '',
    input.dossier ? `## Registry dossier\n${input.dossier}` : '## Registry dossier\nNo registry data found (Wikipedia/Wikidata/SEC/GLEIF) – research from scratch.',
    input.techFacts ? `\n## TechStack Analyzer facts (authoritative, measured on ${input.domain})\n${input.techFacts}` : '',
    input.otherSections ? `\n## Findings from the other briefing sections (ground every recommendation in these)\n${input.otherSections}` : '',
    '',
    `Research and write the section "${meta.title}" (eyebrow "${meta.eyebrow}") now.`,
  ]
    .filter((l) => l !== '')
    .join('\n');
}

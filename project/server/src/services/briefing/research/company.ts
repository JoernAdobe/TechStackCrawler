/**
 * Kunden-Identifikation: Firmenname (LLM aus Seitenauszug + Wikipedia-Abgleich), Domain,
 * Client-Domains und Registerdaten (Wikipedia/Wikidata, SEC EDGAR, GLEIF).
 */
import type { AnalysisResult } from '../../../types/analysis.js';
import { callModel, findToolUse, throwIfAborted, type ModelContext } from '../llm.js';
import { analysisHosts } from '../context.js';
import type { HttpGet } from './http.js';
import { fetchGleif, fetchSecFinancials, type GleifRecord, type SecFinancials } from './registries.js';
import { brandLabel, hostOf, registrableDomain } from './text.js';
import {
  fetchWikidataFacts,
  fetchWikipediaSummary,
  searchWikipediaTitles,
  websiteMatches,
  type WikidataFacts,
  type WikipediaSummary,
} from './wiki.js';

export interface CompanyProfile {
  companyName: string;
  legalName?: string;
  domain: string;
  clientDomains: string[];
  wikipedia?: WikipediaSummary;
  wikidata?: WikidataFacts;
  sec?: SecFinancials;
  gleif?: GleifRecord;
  notes: string[];
}

interface CompanyGuess {
  companyName: string;
  legalName?: string;
  wikipediaQuery: string;
}

const IDENTIFY_TOOL = {
  name: 'identify_company',
  description: 'Return the company that owns the analysed website.',
  input_schema: {
    type: 'object',
    properties: {
      companyName: { type: 'string', description: 'Common company/brand name, e.g. "Porsche"' },
      legalName: { type: 'string', description: 'Legal entity name if evident, e.g. "Dr. Ing. h.c. F. Porsche AG"' },
      wikipediaQuery: { type: 'string', description: 'Best English Wikipedia search query for the company (not the product)' },
    },
    required: ['companyName', 'wikipediaQuery'],
  },
};

const titleCase = (s: string) => s.replace(/(^|[-\s])\p{L}/gu, (m) => m.toUpperCase());

export function fallbackCompanyName(domain: string): string {
  return titleCase(brandLabel(domain).replace(/-/g, ' '));
}

async function guessCompany(analysis: AnalysisResult, domain: string, model: ModelContext): Promise<CompanyGuess> {
  const excerpt = (analysis.pageContentExcerpt ?? '').slice(0, 2_500);
  const res = await callModel(model, 'briefing.identify', {
    system: 'You identify which company operates a website. Answer only via the identify_company tool. Prefer the parent company when the site is a regional subsidiary only if the brand is identical.',
    messages: [
      {
        role: 'user',
        content: `Website: ${analysis.finalUrl ?? analysis.url}\nDomain: ${domain}\n\nAnalyzer summary:\n${(analysis.summary ?? '').slice(0, 1_200)}\n\nPage excerpt:\n${excerpt}`,
      },
    ],
    tools: [IDENTIFY_TOOL],
    tool_choice: { type: 'tool', name: IDENTIFY_TOOL.name },
    max_tokens: 1_000,
    temperature: 0,
  });
  const input = (findToolUse(res, IDENTIFY_TOOL.name)?.input ?? {}) as Partial<CompanyGuess>;
  const companyName = typeof input.companyName === 'string' && input.companyName.trim() ? input.companyName.trim() : fallbackCompanyName(domain);
  return {
    companyName,
    legalName: typeof input.legalName === 'string' && input.legalName.trim() ? input.legalName.trim() : undefined,
    wikipediaQuery: typeof input.wikipediaQuery === 'string' && input.wikipediaQuery.trim() ? input.wikipediaQuery.trim() : `${companyName} company`,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Erster Wikipedia-Treffer, dessen Wikidata-Website zur Domain passt (oder Titel ≈ Name, wenn keine Website hinterlegt). */
async function findWikipedia(
  httpGet: HttpGet,
  guess: CompanyGuess,
  domain: string,
): Promise<{ wikipedia: WikipediaSummary; wikidata?: WikidataFacts } | null> {
  const titles = await searchWikipediaTitles(httpGet, guess.wikipediaQuery, 3);
  for (const title of titles) {
    const summary = await fetchWikipediaSummary(httpGet, title);
    if (!summary) continue;
    const wikidata = summary.qid ? (await fetchWikidataFacts(httpGet, summary.qid)) ?? undefined : undefined;
    if (websiteMatches(wikidata?.website, domain)) return { wikipedia: summary, wikidata };
    const nameMatch = norm(summary.title).includes(norm(guess.companyName)) || norm(guess.companyName).includes(norm(summary.title));
    if (!wikidata?.website && nameMatch) return { wikipedia: summary, wikidata };
  }
  return null;
}

/** Domain + Geschwister-Domains mit gleichem Markenlabel aus Scan/Sitemap + offizielle Website laut Wikidata. */
export function deriveClientDomains(domain: string, hosts: string[], website?: string): string[] {
  const label = brandLabel(domain);
  const out = new Set<string>([registrableDomain(domain)]);
  for (const h of hosts) {
    const reg = registrableDomain(h);
    if (reg && label.length >= 3 && brandLabel(reg).includes(label)) out.add(reg);
  }
  if (website) {
    const reg = registrableDomain(hostOf(website));
    if (reg) out.add(reg);
  }
  return [...out].filter(Boolean);
}

export interface IdentifyDeps {
  httpGet: HttpGet;
  model: ModelContext;
}

export async function identifyCompany(analysis: AnalysisResult, deps: IdentifyDeps): Promise<CompanyProfile> {
  const domain = hostOf(analysis.finalUrl ?? analysis.url) || hostOf(analysis.url);
  const notes: string[] = [];
  let guess: CompanyGuess;
  try {
    guess = await guessCompany(analysis, domain, deps.model);
  } catch (err) {
    throwIfAborted(deps.model.signal);
    notes.push(`Company identification via LLM failed (${err instanceof Error ? err.message : String(err)}); used domain label.`);
    guess = { companyName: fallbackCompanyName(domain), wikipediaQuery: `${fallbackCompanyName(domain)} company` };
  }

  const safe = async <T>(label: string, fn: () => Promise<T | null>): Promise<T | undefined> => {
    try {
      return (await fn()) ?? undefined;
    } catch (err) {
      throwIfAborted(deps.model.signal);
      notes.push(`${label} lookup failed: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  };

  const wiki = await safe('Wikipedia', () => findWikipedia(deps.httpGet, guess, domain));
  if (!wiki) notes.push(`No matching Wikipedia article for "${guess.wikipediaQuery}".`);
  const wikidata = wiki?.wikidata;
  throwIfAborted(deps.model.signal);
  const sec = wikidata?.cik ? await safe('SEC EDGAR', () => fetchSecFinancials(deps.httpGet, wikidata.cik!)) : undefined;
  const gleif = await safe('GLEIF', () =>
    fetchGleif(deps.httpGet, wikidata?.lei ? { lei: wikidata.lei } : { legalName: guess.legalName ?? wikidata?.label ?? guess.companyName }),
  );

  return {
    companyName: wikidata?.label && websiteMatches(wikidata.website, domain) ? wikidata.label : guess.companyName,
    legalName: gleif?.legalName ?? guess.legalName,
    domain,
    clientDomains: deriveClientDomains(domain, analysisHosts(analysis), wikidata?.website),
    wikipedia: wiki?.wikipedia,
    wikidata,
    sec,
    gleif,
    notes,
  };
}

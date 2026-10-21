/**
 * Kundenkontext für externe Tools (z. B. RFP Automation Suite): verdichtet die neueste
 * Analyse eines Library-Accounts inkl. Pre-Briefing zu einem Markdown-Block.
 */
import type { AnalysisResult } from '../types/analysis.js';
import type { BriefingResult } from '../types/briefing.js';
import { briefingInsightLines } from '../prompts/useCaseDiscoveryPrompt.js';
import { portfolioBlock, searchBlock } from './briefing/context.js';

export const ACCOUNT_CONTEXT_MAX_CHARS = 18_000;

export interface AccountContextInput {
  name: string;
  domain: string;
  analysis: AnalysisResult;
  briefing?: BriefingResult | null;
}

const clean = (s: string | undefined | null) => (s ?? '').replace(/\s+/g, ' ').trim();

export function buildAccountContext({ name, domain, analysis, briefing }: AccountContextInput): string {
  const parts: string[] = [];
  parts.push(
    `# ${name} – Account context from TechStack Analyzer`,
    `Domain: ${domain} | URL: ${analysis.url} | Analyzed: ${analysis.analyzedAt.slice(0, 10)}`,
  );

  const briefingLines = briefingInsightLines(briefing);
  if (briefingLines.length) {
    parts.push(`## Client Pre-Briefing (company research)\n${briefingLines.join('\n')}`);
  }

  if (clean(analysis.summary)) parts.push(`## Executive summary\n${clean(analysis.summary)}`);

  const categories = analysis.categories.filter((c) => clean(c.currentTechnology));
  if (categories.length) {
    parts.push(
      `## Current technology stack by category\n${categories
        .map((c) => {
          const extra = [clean(c.challengesAndPainPoints) && `challenges: ${clean(c.challengesAndPainPoints)}`, clean(c.adobeOpportunity) && `Adobe opportunity: ${clean(c.adobeOpportunity)}`]
            .filter(Boolean)
            .join('; ');
          return `- **${c.category}:** ${clean(c.currentTechnology)}${extra ? ` (${extra})` : ''}`;
        })
        .join('\n')}`,
    );
  }

  const techs = analysis.rawDetections.filter((t) => !t.weak).map((t) => `${t.name}${t.version ? ` ${t.version}` : ''}`);
  if (techs.length) parts.push(`## Detected technologies\n${techs.join(', ')}`);

  const useCases = analysis.useCaseDiscovery?.useCases ?? [];
  if (useCases.length) {
    parts.push(
      `## Prioritized Adobe use cases\n${useCases
        .slice(0, 10)
        .map((u) => `${u.rank}. **${clean(u.title)}** (${u.adobeProducts.join(', ')}): ${clean(u.description)} Business value: ${clean(u.businessValue)}`)
        .join('\n')}`,
    );
  }

  const measured = [searchBlock(analysis), portfolioBlock(analysis)].filter(Boolean).join('\n\n');
  if (measured) parts.push(`## Traffic, search, AI visibility & digital portfolio (measured)\n${measured}`);

  const text = parts.join('\n\n');
  return text.length > ACCOUNT_CONTEXT_MAX_CHARS ? `${text.slice(0, ACCOUNT_CONTEXT_MAX_CHARS - 1)}…` : text;
}

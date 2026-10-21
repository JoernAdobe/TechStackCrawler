import type { AnalysisResult } from '../types/analysis.js';
import type { BriefingBlock, BriefingResult } from '../types/briefing.js';
import { MAX_FINDINGS, formatFindingsForPrompt } from '../services/observepoint/findings.js';
import { portfolioBlock, searchBlock } from '../services/briefing/context.js';

/** OP-Findings der gespeicherten Analyse (falls angereichert), max. MAX_FINDINGS. */
export function observePointFindings(analysis: AnalysisResult) {
  return analysis.enrichments?.observepoint?.insights?.findings?.slice(0, MAX_FINDINGS) ?? [];
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function blockText(b: BriefingBlock): string {
  switch (b.type) {
    case 'paragraph':
    case 'note':
      return b.text;
    case 'feature-grid':
      return b.cards.map((c) => `${c.label}: ${c.value}`).join('; ');
    case 'steps':
      return b.items.map((i) => `${i.title}: ${i.body}`).join('; ');
    case 'table':
      return b.rows.slice(0, 6).map((r) => r.join(' | ')).join('; ');
    default:
      return '';
  }
}

/**
 * Verdichtete Pre-Briefing-Erkenntnisse (Executive + Abschnitte). s14 (Adobe Opportunity)
 * wird ausgelassen, weil er selbst aus den Use Cases gespeist wird.
 */
export function briefingInsightsBlock(briefing: BriefingResult | null | undefined): string {
  const out = briefingInsightLines(briefing);
  return out.length
    ? `
## Client Pre-Briefing Insights (company research: strategy, financials, markets, stakeholders)
${out.join('\n')}

Use these business insights: tie use cases to the company's stated strategy, priorities, markets and risks, and reflect the top Adobe plays where they fit. Reference concrete facts from the briefing in descriptions and business value.
`
    : '';
}

/** Markdown-Bullets der Pre-Briefing-Erkenntnisse (ohne Überschrift/Anweisung). */
export function briefingInsightLines(briefing: BriefingResult | null | undefined): string[] {
  if (!briefing) return [];
  const ex = briefing.executive;
  const out: string[] = [];
  if (ex) {
    out.push(`- **Overall Pre-Briefing Score:** ${ex.overallScore ?? 'n/a'}/100 (${ex.band}, confidence ${ex.confidence})`);
    if (ex.verdict) out.push(`- **Verdict:** ${ex.verdict}`);
    for (const b of ex.bullets ?? []) out.push(`- **${b.label}:** ${clip(b.text, 400)}`);
    const subs = (ex.subScores ?? []).filter((s) => s.value !== null);
    if (subs.length) out.push(`- **Sub-scores:** ${subs.map((s) => `${s.label} ${s.value}`).join(', ')}`);
    for (const p of (ex.topPlays ?? []).slice(0, 5)) out.push(`- **Adobe play – ${p.product}:** ${p.headline} (based on: ${clip(p.basedOn, 200)})`);
  }
  for (const s of briefing.sections ?? []) {
    if (s.id === 's14' || s.status === 'skipped' || s.status === 'error') continue;
    const text = clip(s.blocks.map(blockText).filter(Boolean).join(' '), 700);
    if (text) out.push(`- **${s.title}:** ${text}`);
  }
  return out;
}

/** Lesbare Liste der Datenquellen, die in den Prompt einfließen (für die UI). */
export function useCaseDataSources(analysis: AnalysisResult, briefing?: BriefingResult | null): string[] {
  const e = analysis.enrichments;
  const src = ['Tech stack'];
  if (e?.traffic) src.push('Traffic (Semrush)');
  if (e?.lighthouse) src.push('Lighthouse');
  if (e?.geo) src.push('GEO score');
  if (e?.mobileApps?.apps?.length) src.push('Mobile apps');
  if (e?.observepoint) src.push('ObservePoint');
  if (briefing) src.push('Client Pre-Briefing');
  return src;
}

export function buildUseCaseDiscoveryPrompt(
  analysis: AnalysisResult,
  sitemapUrls: string[] = [],
  briefing?: BriefingResult | null,
): string {
  const techStack = analysis.categories
    .map(
      (c) =>
        `- ${c.category}: ${c.currentTechnology} (Challenges: ${c.challengesAndPainPoints})`,
    )
    .join('\n');

  const rawTechs = analysis.rawDetections
    .map((t) => `${t.name}${t.version ? ` ${t.version}` : ''}`)
    .join(', ');

  const insights = analysis.enrichments?.observepoint?.insights;
  const findings = observePointFindings(analysis);
  const findingsBlock = findings.length
    ? `
## Measured Implementation Findings (Source: ObservePoint)
${formatFindingsForPrompt(findings, insights ?? {})}

Use these measured findings: at least 2 use cases should address the most severe findings (e.g. Web SDK migration, tag governance, server-side data collection, privacy/first-party data, page performance). For every use case that is based on one or more findings, list their IDs in "evidenceFindingIds" and mention the concrete evidence in plain language in the description.
`
    : '';

  const pageExcerpt = analysis.pageContentExcerpt
    ? `\n## Page Content Excerpt\n${analysis.pageContentExcerpt}`
    : '';

  const measurements = [searchBlock(analysis), portfolioBlock(analysis)].filter(Boolean).join('\n\n');
  const measurementsBlock = measurements
    ? `
## Traffic, Search, AI Visibility & Digital Portfolio (measured)
${measurements}

Use these numbers to size the opportunity (reach, organic vs. paid mix, AI-answer visibility vs. competitors, app footprint) and to quantify business value where possible.
`
    : '';
  const briefingBlock = briefingInsightsBlock(briefing);

  return `You are an enterprise marketing technology consultant. Based on the technology stack analysis and website context below, derive the TOP 10 most relevant use cases for this organization. Each use case should be actionable, specific to their industry/context, and show how Adobe technology can address it.

CRITICAL – WRITE FOR NON-TECHNICAL READERS:
- Your audience: executives, marketing managers, business stakeholders who are NOT developers or IT experts.
- Use plain, everyday language. Avoid jargon. If you must use a technical term, explain it briefly.
- Keep titles and descriptions short and clear. Focus on business impact (revenue, efficiency, customer experience).

## Website & Analysis Context
- **URL:** ${analysis.url}
- **Executive Summary:** ${analysis.summary}

## Technology Stack (from analysis)
${techStack}

## All Detected Technologies
${rawTechs}
${pageExcerpt}
${measurementsBlock}${briefingBlock}${findingsBlock}${sitemapUrls.length > 0 ? `
## Sitemap URLs (sample)
The following URLs were found in the site's sitemap. Use them to identify interesting page types (product detail, company info, category pages, etc.) and make use cases more concrete.

${sitemapUrls.slice(0, 150).map((u) => `- ${u}`).join('\n')}
` : ''}

## Your Task

Identify which URL patterns are most relevant (e.g. product pages, company/about, category listings). Generate use cases that favor Adobe technology based on the tech stack AND these page types. Be specific: reference concrete page types (e.g. "product detail pages", "category landing pages") where Adobe can add value.

Generate exactly 10 use cases. For each use case provide:
1. **title** – Short, compelling title in plain language (e.g. "Personalized Product Recommendations")
2. **description** – 2–3 sentences in plain language: what it is, why it matters for this site. No jargon.
3. **adobeProducts** – Array of 1–3 Adobe products that best address this use case (e.g. ["Adobe Target", "Adobe Real-Time CDP"])
4. **businessValue** – One sentence on the business impact in plain language (e.g. "Can increase sales by showing the right products to the right customers")
5. **quantifiedRoi** – A quantified impact WITH A NUMBER OR RANGE (e.g. "+10–20% conversion rate", "15–25% lower cost per acquisition", "+5–8% average order value"). Base it on realistic industry outcomes; use a conservative range, not a single hero number.
6. **industryBenchmark** – One short sentence citing a typical industry benchmark that supports the number (e.g. "Retailers using on-site personalization commonly report a 10–30% conversion uplift").
7. **effort** – Implementation effort: exactly one of "Low", "Medium", or "High".
8. **timeToValue** – Rough time to first measurable value (e.g. "4–8 weeks", "1–2 quarters").
9. **impact** – Business impact: exactly one of "Low", "Medium", or "High".
10. **implementationHint** (optional) – Brief tip in plain language on how to get started${findings.length ? `
11. **evidenceFindingIds** (optional) – Array of finding IDs from "Measured Implementation Findings" this use case is based on (e.g. ["${findings[0]!.id}"]); omit or [] if none` : ''}

## Adobe Product Reference
- CMS: Adobe Experience Manager (AEM)
- eCommerce: Adobe Commerce (Magento)
- DMP: Adobe Audience Manager
- CDP: Adobe Real-Time CDP
- Analytics: Adobe Analytics, Adobe Customer Journey Analytics
- Personalization: Adobe Target
- DAM: AEM Assets
- Marketing Automation: Adobe Marketo Engage, Adobe Campaign
- Advertising: Adobe Advertising Cloud
- Tag Management: Adobe Experience Platform Launch
- Journey Orchestration: Adobe Journey Optimizer
- Content: Adobe GenStudio, Adobe Workfront

## Response Format

Respond with ONLY a raw JSON object (no code fences, no markdown):

{
  "summary": "A 2–3 sentence overview in plain language of the top opportunities for this organization. No jargon.",
  "useCases": [
    {
      "rank": 1,
      "title": "Use Case Title",
      "description": "Detailed description...",
      "adobeProducts": ["Adobe Product 1", "Adobe Product 2"],
      "businessValue": "Impact statement...",
      "quantifiedRoi": "+10–20% conversion rate",
      "industryBenchmark": "Retailers using on-site personalization commonly report a 10–30% conversion uplift.",
      "effort": "Medium",
      "timeToValue": "4–8 weeks",
      "impact": "High",
      "implementationHint": "Optional tip..."${findings.length ? `,
      "evidenceFindingIds": []` : ''}
    }
  ]
}

Rules:
- Exactly 10 use cases, ranked by relevance/impact.
- Be specific to the site's industry and tech stack – avoid generic use cases.
- When sitemap URLs are provided, reference concrete page types (e.g. product detail pages, category landing pages) in your use cases.
${findings.length ? '- Only use finding IDs that appear in the findings list; never invent IDs or evidence.\n' : ''}- Prioritize use cases where Adobe has a clear advantage over their current stack.
- ALWAYS include quantifiedRoi, industryBenchmark, effort, timeToValue and impact for every use case.
- quantifiedRoi MUST contain a number or range. Keep ranges realistic and conservative; never fabricate a precise single figure.
- effort and impact MUST be exactly one of "Low", "Medium", or "High".
- All text in English.
- PLAIN LANGUAGE: Write for non-technical readers. No jargon. Short sentences. Focus on business impact.
- Output ONLY the JSON object, nothing else.`;
}

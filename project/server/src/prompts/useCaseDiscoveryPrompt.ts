import type { AnalysisResult } from '../types/analysis.js';

export function buildUseCaseDiscoveryPrompt(analysis: AnalysisResult): string {
  const techStack = analysis.categories
    .map(
      (c) =>
        `- ${c.category}: ${c.currentTechnology} (Challenges: ${c.challengesAndPainPoints})`,
    )
    .join('\n');

  const rawTechs = analysis.rawDetections
    .map((t) => `${t.name}${t.version ? ` ${t.version}` : ''}`)
    .join(', ');

  const pageExcerpt = analysis.pageContentExcerpt
    ? `\n## Page Content Excerpt\n${analysis.pageContentExcerpt}`
    : '';

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

## Your Task

Generate exactly 10 use cases. For each use case provide:
1. **title** – Short, compelling title in plain language (e.g. "Personalized Product Recommendations")
2. **description** – 2–3 sentences in plain language: what it is, why it matters for this site. No jargon.
3. **adobeProducts** – Array of 1–3 Adobe products that best address this use case (e.g. ["Adobe Target", "Adobe Real-Time CDP"])
4. **businessValue** – One sentence on the business impact in plain language (e.g. "Can increase sales by showing the right products to the right customers")
5. **implementationHint** (optional) – Brief tip in plain language on how to get started

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
      "implementationHint": "Optional tip..."
    }
  ]
}

Rules:
- Exactly 10 use cases, ranked by relevance/impact.
- Be specific to the site's industry and tech stack – avoid generic use cases.
- Prioritize use cases where Adobe has a clear advantage over their current stack.
- All text in English.
- PLAIN LANGUAGE: Write for non-technical readers. No jargon. Short sentences. Focus on business impact.
- Output ONLY the JSON object, nothing else.`;
}

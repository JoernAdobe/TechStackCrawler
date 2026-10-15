import { config } from '../config.js';
import { getBedrockClient } from './bedrockClient.js';
import { callLlm } from './llmCall.js';
import { RetryableResponseError } from '../utils/retry.js';
import { parseAIJson } from '../utils/aiJson.js';
import { buildUseCaseDiscoveryPrompt, observePointFindings } from '../prompts/useCaseDiscoveryPrompt.js';
import { applyFindingsToUseCases, ruleBasedUseCases } from './observepoint/findings.js';
import { fetchSitemapUrls } from './sitemap.js';
import type { AnalysisResult, UseCaseDiscoveryResult } from '../types/analysis.js';

export interface DiscoverUseCasesResult {
  result: UseCaseDiscoveryResult;
  sitemapUrls: string[];
}

export async function discoverUseCases(
  analysis: AnalysisResult,
): Promise<DiscoverUseCasesResult> {
  const useMock =
    process.env.USE_MOCK_AI === '1' || process.env.BEDROCK_SKIP_SIMULATE === '1';

  const findings = observePointFindings(analysis);

  if (useMock) {
    const mock = getMockUseCases(analysis);
    // Demo-Modus: regelbasierte OP-Use-Cases voranstellen, Gesamtzahl bleibt 10.
    const rules = ruleBasedUseCases(findings);
    const useCases = [...rules, ...mock.useCases].slice(0, mock.useCases.length).map((uc, i) => ({ ...uc, rank: i + 1 }));
    return { result: { ...mock, useCases: applyFindingsToUseCases(useCases, findings) }, sitemapUrls: [] };
  }

  const sitemapUrls = await fetchSitemapUrls(analysis.url);
  const userPrompt = buildUseCaseDiscoveryPrompt(analysis, sitemapUrls);

  const runOnce = async (
    maxTokens: number,
    signal: AbortSignal,
  ): Promise<{ text: string; stopReason: string | null }> => {
    const response = await getBedrockClient().messages.create(
      {
        model: config.bedrock.model,
        max_tokens: maxTokens,
        system: 'You are a senior enterprise martech consultant. You always respond with valid JSON only, no markdown or code fences.',
        messages: [{ role: 'user', content: userPrompt }],
      },
      { signal, maxRetries: 0 },
    );

    const text =
      response.content?.[0]?.type === 'text' ? response.content[0].text : '';
    return { text, stopReason: response.stop_reason };
  };

  // Retry/Timeout/Fehlerklassen zentral in callLlm (LlmError → errorHandler).
  const result = await callLlm('use-case-discovery', async (signal) => {
    let { text, stopReason } = await runOnce(config.bedrock.maxTokens, signal);

    // Bei Truncation einmalig mit doppeltem Budget wiederholen.
    if (stopReason === 'max_tokens') {
      console.warn(
        `Use-Case-Antwort bei ${config.bedrock.maxTokens} Tokens abgeschnitten – Retry mit ${config.bedrock.maxTokens * 2}.`,
      );
      ({ text, stopReason } = await runOnce(config.bedrock.maxTokens * 2, signal));
    }

    let parsed: UseCaseDiscoveryResult;
    try {
      parsed = parseAIJson<UseCaseDiscoveryResult>(text);
    } catch (err) {
      throw new RetryableResponseError('Use case response is not valid JSON', { cause: err });
    }
    if (!parsed?.useCases || !Array.isArray(parsed.useCases)) {
      throw new RetryableResponseError('Invalid use case response structure');
    }
    return parsed;
  });

  // OP-Evidenz verknüpfen (validierte LLM-IDs, Keyword-Fallback, regelbasierte Lückenfüller).
  result.useCases = applyFindingsToUseCases(result.useCases, findings);
  return { result, sitemapUrls };
}

function getMockUseCases(analysis: AnalysisResult): UseCaseDiscoveryResult {
  const techs = analysis.categories
    .map((c) => c.currentTechnology)
    .filter((t) => t !== 'Not Detected' && t !== 'N/A');
  return {
    summary: `[Demo] Top 10 Use Cases für ${analysis.url} basierend auf ${techs.length} erkannten Technologien.`,
    useCases: [
      {
        rank: 1,
        title: 'Personalized Product Recommendations',
        description:
          'Leverage customer behavior data to show relevant product suggestions.',
        adobeProducts: ['Adobe Target', 'Adobe Real-Time CDP'],
        businessValue: 'Increase conversion and average order value.',
        quantifiedRoi: '+10–20% conversion rate',
        industryBenchmark:
          'Retailers using on-site personalization commonly report a 10–30% conversion uplift.',
        effort: 'Medium',
        timeToValue: '4–8 weeks',
        impact: 'High',
        implementationHint: 'Start with Target for on-site personalization.',
      },
      {
        rank: 2,
        title: 'Unified Customer Profile',
        description:
          'Consolidate data from web, email, and ads into a single view.',
        adobeProducts: ['Adobe Real-Time CDP'],
        businessValue: 'Better targeting and personalization across channels.',
        quantifiedRoi: '+5–15% marketing efficiency',
        industryBenchmark:
          'Unified profiles typically cut wasted ad spend by 10–25%.',
        effort: 'High',
        timeToValue: '1–2 quarters',
        impact: 'High',
      },
      {
        rank: 3,
        title: 'Journey Orchestration',
        description:
          'Automate multi-channel campaigns based on customer signals.',
        adobeProducts: ['Adobe Journey Optimizer'],
        businessValue: 'Scale personalized engagement efficiently.',
        quantifiedRoi: '+8–12% customer retention',
        industryBenchmark:
          'Orchestrated journeys often lift engagement rates by 15–25%.',
        effort: 'Medium',
        timeToValue: '6–10 weeks',
        impact: 'Medium',
      },
      {
        rank: 4,
        title: 'Advanced Analytics',
        description:
          'Deep-dive into customer journeys and attribution.',
        adobeProducts: ['Adobe Analytics', 'Adobe Customer Journey Analytics'],
        businessValue: 'Data-driven decision making.',
      },
      {
        rank: 5,
        title: 'Content Personalization',
        description:
          'Deliver tailored content based on segment and context.',
        adobeProducts: ['Adobe Target', 'Adobe Experience Manager'],
        businessValue: 'Higher engagement and relevance.',
      },
      {
        rank: 6,
        title: 'Marketing Automation',
        description:
          'Nurture leads with automated email and cross-channel flows.',
        adobeProducts: ['Adobe Marketo Engage', 'Adobe Campaign'],
        businessValue: 'Efficient lead conversion at scale.',
      },
      {
        rank: 7,
        title: 'Advertising Optimization',
        description:
          'Unify search, social, and display for better ROI.',
        adobeProducts: ['Adobe Advertising Cloud'],
        businessValue: 'Lower CAC, higher ROAS.',
      },
      {
        rank: 8,
        title: 'Tag & Data Governance',
        description:
          'Centralize tag management and ensure data quality.',
        adobeProducts: ['Adobe Experience Platform Launch'],
        businessValue: 'Clean data, faster deployment.',
      },
      {
        rank: 9,
        title: 'Digital Asset Management',
        description:
          'Organize and distribute brand assets efficiently.',
        adobeProducts: ['Adobe Experience Manager Assets'],
        businessValue: 'Faster time-to-market for campaigns.',
      },
      {
        rank: 10,
        title: 'Headless Commerce',
        description:
          'Modern storefront with API-driven commerce backend.',
        adobeProducts: ['Adobe Commerce (Magento)'],
        businessValue: 'Flexible, scalable e-commerce.',
      },
    ],
  };
}

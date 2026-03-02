import { config } from '../config.js';
import { getBedrockClient } from './bedrockClient.js';
import { buildUseCaseDiscoveryPrompt } from '../prompts/useCaseDiscoveryPrompt.js';
import { fetchSitemapUrls } from './sitemap.js';
import type { AnalysisResult, UseCaseDiscoveryResult } from '../types/analysis.js';

const client = getBedrockClient();

export interface DiscoverUseCasesResult {
  result: UseCaseDiscoveryResult;
  sitemapUrls: string[];
}

export async function discoverUseCases(
  analysis: AnalysisResult,
): Promise<DiscoverUseCasesResult> {
  const useMock =
    process.env.USE_MOCK_AI === '1' || process.env.BEDROCK_SKIP_SIMULATE === '1';

  if (useMock) {
    return { result: getMockUseCases(analysis), sitemapUrls: [] };
  }

  const sitemapUrls = await fetchSitemapUrls(analysis.url);
  const userPrompt = buildUseCaseDiscoveryPrompt(analysis, sitemapUrls);

  try {
    const response = await client.messages.create({
      model: config.bedrock.model,
      max_tokens: 4096,
      system: 'You are a senior enterprise martech consultant. You always respond with valid JSON only, no markdown or code fences.',
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text =
      response.content?.[0]?.type === 'text'
        ? response.content[0].text
        : '';

    let jsonStr = text.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr) as UseCaseDiscoveryResult;

    if (!parsed.useCases || !Array.isArray(parsed.useCases)) {
      throw new Error('Invalid use case response structure');
    }

    return { result: parsed, sitemapUrls };
  } catch (e) {
    const msg = (e as Error).message;
    if (
      msg.includes('403') ||
      msg.includes('expired') ||
      msg.includes('unauthorized') ||
      msg.includes('credentials')
    ) {
      throw new Error(
        'Bedrock-Zugriff fehlgeschlagen. Nutze IAM: aws configure ODER AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY in .env.',
      );
    }
    throw e;
  }
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
        implementationHint: 'Start with Target for on-site personalization.',
      },
      {
        rank: 2,
        title: 'Unified Customer Profile',
        description:
          'Consolidate data from web, email, and ads into a single view.',
        adobeProducts: ['Adobe Real-Time CDP'],
        businessValue: 'Better targeting and personalization across channels.',
      },
      {
        rank: 3,
        title: 'Journey Orchestration',
        description:
          'Automate multi-channel campaigns based on customer signals.',
        adobeProducts: ['Adobe Journey Optimizer'],
        businessValue: 'Scale personalized engagement efficiently.',
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

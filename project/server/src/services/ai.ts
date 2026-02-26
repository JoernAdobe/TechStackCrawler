import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import { config } from '../config.js';
import { buildSystemPrompt, buildAnalysisPrompt } from '../prompts/analysisPrompt.js';
import type { ScrapedData } from './scraper.js';
import type { DetectedTech } from './customDetectors.js';
import type { CategoryResult } from '../types/analysis.js';

// API-Key + Endpoint ODER AWS IAM Credentials
const useApiKey = config.bedrock.apiKey && config.bedrock.endpoint;

const client = new AnthropicBedrock(
  (useApiKey
    ? {
        skipAuth: true,
        baseURL: config.bedrock.endpoint,
        defaultHeaders: {
          Authorization: `Bearer ${config.bedrock.apiKey}`,
        },
        awsRegion: config.bedrock.awsRegion,
      }
    : {
        awsAccessKey: config.bedrock.awsAccessKeyId || undefined,
        awsSecretKey: config.bedrock.awsSecretAccessKey || undefined,
        awsRegion: config.bedrock.awsRegion,
        baseURL: config.bedrock.endpoint || undefined,
      }) as never,
);

export interface AIAnalysisResult {
  summary: string;
  categories: CategoryResult[];
}

/** Mock result for testing when Bedrock is unavailable (e.g. expired key). */
function getMockResult(
  scraped: ScrapedData,
  detected: DetectedTech[],
): AIAnalysisResult {
  const techs = detected.slice(0, 5);
  return {
    summary: `[Demo] Analyse von ${scraped.title || scraped.url}. ${detected.length} Technologien erkannt.`,
    categories: techs.length
      ? techs.map((d) => ({
          category: d.name,
          currentTechnology: d.version ? `${d.name} ${d.version}` : d.name,
          challengesAndPainPoints: '-',
          adobeOpportunity: '-',
        }))
      : [
          {
            category: 'Allgemein',
            currentTechnology: '-',
            challengesAndPainPoints: '-',
            adobeOpportunity: '-',
          },
        ],
  };
}

export async function analyzeWithAI(
  scraped: ScrapedData,
  detectedTechnologies: DetectedTech[],
  onChunk?: (text: string) => void,
): Promise<AIAnalysisResult> {
  const useMock =
    process.env.USE_MOCK_AI === '1' || process.env.BEDROCK_SKIP_SIMULATE === '1';

  if (useMock) {
    onChunk?.('\n');
    return getMockResult(scraped, detectedTechnologies);
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildAnalysisPrompt(scraped, detectedTechnologies);

  try {
    const stream = await client.messages.stream({
      model: config.bedrock.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    let fullResponse = '';

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        fullResponse += event.delta.text;
        onChunk?.(event.delta.text);
      }
    }

    // Parse the JSON response -- try raw first, then look for code fences
    let jsonStr = fullResponse.trim();

    // Strip code fences if the model included them anyway
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr) as AIAnalysisResult;

    // Validate basic structure
    if (!parsed.summary || !Array.isArray(parsed.categories)) {
      throw new Error('Invalid response structure');
    }

    return parsed;
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('403') || msg.includes('expired')) {
      console.error('Bedrock error:', msg);
      throw new Error(
        'Bedrock API-Key abgelaufen. Neuen Key erstellen: AWS Console → Bedrock → API keys → Generate. Oder IAM nutzen (AWS_ACCESS_KEY_ID in .env).',
      );
    }
    if (msg.includes('unauthorized') || msg.includes('credentials')) {
      throw new Error('Bedrock-Zugriff fehlgeschlagen. Prüfe BEDROCK_API_KEY oder IAM-Credentials in .env.');
    }
    throw e;
  }
}

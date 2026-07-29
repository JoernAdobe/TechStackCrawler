import { config } from '../config.js';
import { getBedrockClient } from './bedrockClient.js';
import { parseAIJson } from '../utils/aiJson.js';
import { buildSystemPrompt, buildAnalysisPrompt } from '../prompts/analysisPrompt.js';
import type { ScrapedData } from './scraper.js';
import type { DetectedTech } from './customDetectors.js';
import type { CategoryResult } from '../types/analysis.js';

const client = getBedrockClient();

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
  weakDetections: DetectedTech[] = [],
): Promise<AIAnalysisResult> {
  const useMock =
    process.env.USE_MOCK_AI === '1' || process.env.BEDROCK_SKIP_SIMULATE === '1';

  if (useMock) {
    onChunk?.('\n');
    return getMockResult(scraped, detectedTechnologies);
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildAnalysisPrompt(scraped, detectedTechnologies, weakDetections);

  /** Ein Streaming-Durchlauf; liefert Text und stop_reason (für Truncation-Erkennung). */
  const runOnce = async (
    maxTokens: number,
  ): Promise<{ text: string; stopReason: string | null }> => {
    const stream = client.messages.stream({
      model: config.bedrock.model,
      max_tokens: maxTokens,
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

    const finalMessage = await stream.finalMessage();
    return { text: fullResponse, stopReason: finalMessage.stop_reason };
  };

  try {
    let { text, stopReason } = await runOnce(config.bedrock.maxTokens);

    // Bei Truncation einmalig mit doppeltem Budget wiederholen.
    if (stopReason === 'max_tokens') {
      console.warn(
        `Analyse-Antwort bei ${config.bedrock.maxTokens} Tokens abgeschnitten – Retry mit ${config.bedrock.maxTokens * 2}.`,
      );
      ({ text, stopReason } = await runOnce(config.bedrock.maxTokens * 2));
    }

    const parsed = parseAIJson<AIAnalysisResult>(text);

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

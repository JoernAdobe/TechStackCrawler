import { config } from '../config.js';
import { getBedrockClient } from './bedrockClient.js';
import { callLlm } from './llmCall.js';
import { parseAIJson } from '../utils/aiJson.js';
import { RetryableResponseError } from '../utils/retry.js';
import { buildSystemPrompt, buildAnalysisPrompt } from '../prompts/analysisPrompt.js';
import type { ScrapedData } from './scraper.js';
import type { DetectedTech } from './customDetectors.js';
import type { CategoryResult } from '../types/analysis.js';

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
    signal: AbortSignal,
  ): Promise<{ text: string; stopReason: string | null }> => {
    const stream = getBedrockClient().messages.stream(
      {
        model: config.bedrock.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
      // Eigenes Retry in callLlm – SDK-interne Retries aus, damit sich Wartezeiten nicht multiplizieren.
      { signal, maxRetries: 0 },
    );

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

  // Ein Versuch = Streaming (+ einmaliger Truncation-Retry) + Parsen + Strukturprüfung.
  // Abbruch ("terminated"), Throttling, 5xx und unbrauchbares JSON lösen in callLlm einen
  // Retry mit Backoff aus; endgültige Fehler kommen als LlmError mit Klassifizierung.
  return callLlm('analysis', async (signal) => {
    let { text, stopReason } = await runOnce(config.bedrock.maxTokens, signal);

    if (stopReason === 'max_tokens') {
      console.warn(
        `Analyse-Antwort bei ${config.bedrock.maxTokens} Tokens abgeschnitten – Retry mit ${config.bedrock.maxTokens * 2}.`,
      );
      ({ text, stopReason } = await runOnce(config.bedrock.maxTokens * 2, signal));
    }

    return validateAnalysisJson(text);
  });
}

/** Parst und prüft die Modellantwort; unbrauchbare Antworten sind wiederholbar. */
export function validateAnalysisJson(text: string): AIAnalysisResult {
  let parsed: Partial<AIAnalysisResult> | null;
  try {
    parsed = parseAIJson<Partial<AIAnalysisResult>>(text);
  } catch (err) {
    throw new RetryableResponseError('AI response is not valid JSON', { cause: err });
  }
  if (!parsed || typeof parsed.summary !== 'string' || !Array.isArray(parsed.categories)) {
    throw new RetryableResponseError('AI response has an invalid structure');
  }
  const categories = parsed.categories
    .filter((c): c is CategoryResult => !!c && typeof c === 'object')
    .map((c) => ({
      category: String(c.category ?? ''),
      currentTechnology: String(c.currentTechnology ?? ''),
      challengesAndPainPoints: String(c.challengesAndPainPoints ?? ''),
      adobeOpportunity: String(c.adobeOpportunity ?? ''),
    }));
  return { summary: parsed.summary, categories };
}

import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import { config } from '../config.js';
import { buildSystemPrompt, buildAnalysisPrompt } from '../prompts/analysisPrompt.js';
import type { ScrapedData } from './scraper.js';
import type { DetectedTech } from './customDetectors.js';
import type { CategoryResult } from '../types/analysis.js';

const client = new AnthropicBedrock({
  awsAccessKey: config.aws.accessKeyId,
  awsSecretKey: config.aws.secretAccessKey,
  awsRegion: config.aws.region,
});

export interface AIAnalysisResult {
  summary: string;
  categories: CategoryResult[];
}

export async function analyzeWithAI(
  scraped: ScrapedData,
  detectedTechnologies: DetectedTech[],
  onChunk?: (text: string) => void,
): Promise<AIAnalysisResult> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildAnalysisPrompt(scraped, detectedTechnologies);

  const stream = await client.messages.stream({
    model: config.aws.bedrockModel,
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

  try {
    const parsed = JSON.parse(jsonStr) as AIAnalysisResult;

    // Validate basic structure
    if (!parsed.summary || !Array.isArray(parsed.categories)) {
      throw new Error('Invalid response structure');
    }

    return parsed;
  } catch (e) {
    console.error('Failed to parse AI response:', jsonStr.substring(0, 500));
    throw new Error(
      `Failed to parse AI response as structured JSON: ${(e as Error).message}`,
    );
  }
}

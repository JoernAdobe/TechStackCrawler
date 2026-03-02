import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import { config } from '../config.js';

let instance: AnthropicBedrock | null = null;

export function getBedrockClient(): AnthropicBedrock {
  if (instance) return instance;

  const useApiKey = config.bedrock.apiKey && config.bedrock.endpoint;

  // SDK types don't cover the skipAuth + custom baseURL pattern cleanly.
  instance = new AnthropicBedrock(
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
  return instance;
}

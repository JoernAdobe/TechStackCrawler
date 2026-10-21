import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import { config } from '../config.js';
import { adaptRequestForModel } from './modelCompat.js';

let instance: AnthropicBedrock | null = null;

/** Nur für Tests: eigenen (Mock-)Client einsetzen bzw. mit `null` zurücksetzen. */
export function setBedrockClientForTests(client: AnthropicBedrock | null): void {
  instance = client;
}

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
  wrapForModelCompat(instance);
  return instance;
}

/** Alle create/stream-Aufrufe laufen durch adaptRequestForModel (Sonnet 4.6 ↔ 5.x kompatibel). */
function wrapForModelCompat(client: AnthropicBedrock): void {
  const messages = client.messages as unknown as {
    create: (body: Record<string, unknown>, opts?: unknown) => unknown;
    stream: (body: Record<string, unknown>, opts?: unknown) => unknown;
  };
  const create = messages.create.bind(messages);
  const stream = messages.stream.bind(messages);
  messages.create = (body, opts) => create(adaptRequestForModel(String(body.model ?? ''), body), opts);
  messages.stream = (body, opts) => stream(adaptRequestForModel(String(body.model ?? ''), body), opts);
}

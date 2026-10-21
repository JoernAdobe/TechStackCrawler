/**
 * Schlanke Messages-API-Schicht für das Briefing (Tool-Use). Eigene Minimal-Typen, damit
 * Tests ohne SDK/Bedrock einen Fake-Client injizieren können. Produktiv: Bedrock-Client +
 * callLlm (Timeout, Retry, Fehlerklassen).
 */
import { config } from '../../config.js';
import { getBedrockClient } from '../bedrockClient.js';
import { modelGeneration } from '../modelCompat.js';
import { callLlm, type LlmCallOptions } from '../llmCall.js';
import type { UsageTracker } from './usage.js';

export type LlmContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  // Claude 5.x: Thinking-Blöcke unverändert in den Verlauf zurückgeben (Signatur wird geprüft).
  | { type: 'thinking'; thinking: string; signature?: string }
  | { type: 'redacted_thinking'; data: string };

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string | LlmContent[];
}

export interface LlmTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type LlmToolChoice = { type: 'auto' } | { type: 'any' } | { type: 'tool'; name: string };

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  tool_choice?: LlmToolChoice;
  max_tokens: number;
  temperature?: number;
}

export interface LlmResponse {
  content: LlmContent[];
  stop_reason: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
}

/** Ein einzelner Modellaufruf; `signal` bricht den HTTP-Request ab. */
export type LlmCreate = (req: LlmRequest, signal: AbortSignal) => Promise<LlmResponse>;

const PROMPT_CACHE = process.env.BRIEFING_PROMPT_CACHE !== '0';

/**
 * Prompt-Caching (Bedrock/Claude): System-Prompt + Tools und der bisherige Verlauf werden als
 * Cache-Präfix markiert – die Tool-Schleife schickt den Verlauf bei jedem Schritt erneut.
 */
export function withCacheControl(req: LlmRequest): Record<string, unknown> {
  const cache = { type: 'ephemeral' };
  const messages = req.messages.map((m, i) => {
    if (i !== req.messages.length - 1) return m;
    const content: Array<Record<string, unknown>> =
      typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content.map((c) => ({ ...c }));
    if (content.length) content[content.length - 1] = { ...content[content.length - 1], cache_control: cache };
    return { role: m.role, content };
  });
  return { ...req, system: [{ type: 'text', text: req.system, cache_control: cache }], messages };
}

export const bedrockCreate: LlmCreate = async (req, signal) => {
  const body = PROMPT_CACHE ? withCacheControl(req) : req;
  const response = await getBedrockClient().messages.create(
    { model: config.bedrock.model, ...body } as never,
    { signal, maxRetries: 0 },
  );
  return response as unknown as LlmResponse;
};

export class BriefingCancelledError extends Error {
  constructor() {
    super('briefing cancelled');
    this.name = 'BriefingCancelledError';
  }
}

export interface ModelContext {
  create: LlmCreate;
  usage: UsageTracker;
  signal: AbortSignal;
  llmOptions?: LlmCallOptions;
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new BriefingCancelledError();
}

/** Ein Modellaufruf mit Timeout/Retry (callLlm), Token-Zählung und Abbruch über das Job-Signal. */
export async function callModel(ctx: ModelContext, label: string, req: LlmRequest): Promise<LlmResponse> {
  throwIfAborted(ctx.signal);
  try {
    return await callLlm(
      label,
      async (signal) => {
        if (ctx.signal.aborted) throw new BriefingCancelledError();
        try {
          const combined = AbortSignal.any([signal, ctx.signal]);
          const res = await ctx.create(req, combined);
          ctx.usage.addTokens(res.usage);
          return await ensureForcedTool(ctx, req, res, combined);
        } catch (err) {
          if (ctx.signal.aborted) throw new BriefingCancelledError();
          throw err;
        }
      },
      ctx.llmOptions,
    );
  } catch (err) {
    throwIfAborted(ctx.signal);
    throw err;
  }
}

/**
 * Claude 5.x erlaubt keine erzwungene Tool-Wahl (modelCompat macht daraus `auto`). Ruft das Modell
 * das geforderte Tool trotzdem nicht auf, wird einmal explizit nachgefordert.
 */
async function ensureForcedTool(ctx: ModelContext, req: LlmRequest, res: LlmResponse, signal: AbortSignal): Promise<LlmResponse> {
  const forced = req.tool_choice?.type === 'tool' ? req.tool_choice.name : null;
  if (!forced || modelGeneration(config.bedrock.model) === 'legacy' || findToolUse(res, forced)) return res;
  const pending = res.content.filter((c): c is Extract<LlmContent, { type: 'tool_use' }> => c.type === 'tool_use');
  const nudge: LlmContent[] = [
    ...pending.map((t) => ({ type: 'tool_result' as const, tool_use_id: t.id, content: `Not executed. Call ${forced} now.`, is_error: true })),
    { type: 'text', text: `Call the ${forced} tool now. Do not call any other tool and do not answer in plain text.` },
  ];
  const retry = await ctx.create(
    { ...req, messages: [...req.messages, { role: 'assistant', content: res.content }, { role: 'user', content: nudge }] },
    signal,
  );
  ctx.usage.addTokens(retry.usage);
  return retry;
}

/** Erstes tool_use mit diesem Namen. */
export function findToolUse(res: LlmResponse, name: string): { id: string; input: unknown } | undefined {
  for (const c of res.content) if (c.type === 'tool_use' && c.name === name) return { id: c.id, input: c.input };
  return undefined;
}

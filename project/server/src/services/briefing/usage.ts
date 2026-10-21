/** Token-/Kosten-/Recherche-Zähler eines Briefing-Laufs. */
import type { BriefingUsage } from '../../types/briefing.js';
import { config } from '../../config.js';
import { modelPricing } from '../modelCompat.js';

/** Listenpreis des konfigurierten Bedrock-Modells (USD pro 1 Mio. Tokens); per Env überschreibbar. */
const PRICING = modelPricing(config.bedrock.model);
const USD_PER_M_INPUT = Number(process.env.BRIEFING_USD_PER_M_INPUT) || PRICING.input;
const USD_PER_M_OUTPUT = Number(process.env.BRIEFING_USD_PER_M_OUTPUT) || PRICING.output;

/** Anthropic-Preisfaktoren für Prompt-Caching: Schreiben 1,25×, Lesen modellabhängig (0,1× bzw. 0,05×). */
const CACHE_WRITE_FACTOR = 1.25;
const CACHE_READ_FACTOR = PRICING.cacheReadFactor;

export class UsageTracker {
  /** Alle Input-Tokens inkl. Cache-Lese-/Schreib-Tokens. */
  inputTokens = 0;
  outputTokens = 0;
  cacheReadTokens = 0;
  cacheWriteTokens = 0;
  calls = 0;
  searches = 0;
  fetches = 0;

  addTokens(usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | undefined): void {
    this.calls++;
    if (!usage) return;
    const read = usage.cache_read_input_tokens ?? 0;
    const write = usage.cache_creation_input_tokens ?? 0;
    this.inputTokens += (usage.input_tokens ?? 0) + read + write;
    this.cacheReadTokens += read;
    this.cacheWriteTokens += write;
    this.outputTokens += usage.output_tokens ?? 0;
  }

  snapshot(): BriefingUsage {
    const plainInput = this.inputTokens - this.cacheReadTokens - this.cacheWriteTokens;
    const inputCost = plainInput + this.cacheWriteTokens * CACHE_WRITE_FACTOR + this.cacheReadTokens * CACHE_READ_FACTOR;
    const usd = (inputCost * USD_PER_M_INPUT + this.outputTokens * USD_PER_M_OUTPUT) / 1_000_000;
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      usd: Math.round(usd * 10_000) / 10_000,
      searches: this.searches,
      fetches: this.fetches,
    };
  }
}

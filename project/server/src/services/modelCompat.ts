/**
 * Modellabhängige Anpassung der Messages-Requests.
 *
 * Ab der Claude-5.x-Generation (z. B. Sonnet 5.5) lehnt die API mit HTTP 400 ab:
 * Sampling-Parameter (temperature/top_p/top_k), erzwungene Tool-Wahl und – je nach Modell –
 * `thinking: {type:'disabled'}`. Außerdem läuft Thinking ohne `thinking`-Feld standardmäßig.
 * Damit Sonnet 4.6 (Rollback) und 5.x mit demselben Code laufen, passt diese Schicht den Request
 * zentral an. Quelle: https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide
 */

type Generation = 'legacy' | 'gen5' | 'gen5_5';

export function modelGeneration(model: string): Generation {
  const m = model.toLowerCase();
  if (/claude-(sonnet|opus|haiku)-5-5|claude-(fable|mythos)-5/.test(m)) return 'gen5_5';
  if (/claude-(sonnet|opus|haiku)-5(?![-.]?\d)/.test(m)) return 'gen5';
  return 'legacy';
}

type Params = Record<string, unknown>;

export function adaptRequestForModel<T extends Params>(model: string, params: T): T {
  const gen = modelGeneration(model);
  if (gen === 'legacy') return params;
  const out: Params = { ...params };
  delete out.temperature;
  delete out.top_p;
  delete out.top_k;
  const choice = out.tool_choice as { type?: string } | undefined;
  if (choice && (choice.type === 'tool' || choice.type === 'any')) out.tool_choice = { type: 'auto' };
  // Kein Thinking vor der Antwort (Verhalten wie Sonnet 4.6, kalkulierbare Kosten/Latenz).
  if (out.thinking === undefined) out.thinking = gen === 'gen5_5' ? { type: 'between_tools' } : { type: 'disabled' };
  return out as T;
}

/** USD pro 1 Mio. Tokens (Listenpreis) und Cache-Lese-Faktor; unbekannte Modelle → Sonnet-4.6-Preise. */
export function modelPricing(model: string): { input: number; output: number; cacheReadFactor: number } {
  const m = model.toLowerCase();
  if (m.includes('claude-sonnet-5-5')) return { input: 2, output: 10, cacheReadFactor: 0.05 };
  if (m.includes('claude-opus-5-5')) return { input: 4, output: 20, cacheReadFactor: 0.05 };
  if (/claude-sonnet-5(?![-.]?\d)/.test(m)) return { input: 2, output: 10, cacheReadFactor: 0.1 };
  return { input: 3, output: 15, cacheReadFactor: 0.1 };
}

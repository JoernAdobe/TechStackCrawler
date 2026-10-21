/** Kleine Infrastruktur für die Recherche: TTL-Cache und prozessweite Serialisierung mit Mindestabstand. */

export class TtlCache<V> {
  private readonly map = new Map<string, { value: V; expires: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 2_000,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V): void {
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expires: this.now() + this.ttlMs });
  }

  clear(): void {
    this.map.clear();
  }
}

export interface SerialLimiterDeps {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Führt Aufgaben strikt nacheinander aus und hält zwischen zwei Starts mindestens
 * `minIntervalMs` Abstand (z. B. DuckDuckGo: ≥ 1,2 s, prozessweit über alle Jobs).
 */
export function createSerialLimiter(minIntervalMs: number, deps: SerialLimiterDeps = {}) {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let chain: Promise<unknown> = Promise.resolve();
  let lastStart = -Infinity;

  return function schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = async () => {
      const wait = lastStart + minIntervalMs - now();
      if (wait > 0) await sleep(wait);
      lastStart = now();
      return task();
    };
    const result = chain.then(run, run);
    chain = result.catch(() => undefined);
    return result;
  };
}

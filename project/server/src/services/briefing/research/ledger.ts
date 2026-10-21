/**
 * Quellen-Ledger: welche URLs wurden tatsächlich abgerufen (oder als Suchtreffer gesehen)?
 * Grundlage des Quellen-Guardrails – zitiert werden darf nur, was hier steht.
 */
import { hostOf, normalizeUrl } from './text.js';

export type LedgerKind = 'fetched' | 'search' | 'reference';

export interface LedgerEntry {
  url: string;
  title: string;
  publisher: string;
  /** "Mon YYYY" aus der Seite; null = unbekannt. */
  date: string | null;
  kind: LedgerKind;
  /** Gekürzter Seitentext (für die Datumsplausibilisierung). */
  text?: string;
  paywalled?: boolean;
}

const RANK: Record<LedgerKind, number> = { reference: 3, fetched: 2, search: 1 };

export function publisherFromHost(url: string): string {
  return hostOf(url) || 'Unknown';
}

export class SourceLedger {
  private readonly entries = new Map<string, LedgerEntry>();

  record(entry: LedgerEntry, aliases: string[] = []): void {
    for (const u of [entry.url, ...aliases]) {
      const key = normalizeUrl(u);
      if (!key) continue;
      const prev = this.entries.get(key);
      if (!prev || RANK[entry.kind] >= RANK[prev.kind]) this.entries.set(key, { ...entry, text: entry.text?.slice(0, 8_000) });
    }
  }

  get(url: string): LedgerEntry | undefined {
    const key = normalizeUrl(url);
    return key ? this.entries.get(key) : undefined;
  }

  get size(): number {
    return this.entries.size;
  }
}

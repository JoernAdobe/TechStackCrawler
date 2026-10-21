/**
 * Recherche-Werkzeuge für die LLM-Tool-Schleife (web_search, fetch_page).
 * Liefert LLM-lesbaren Text, zählt Nutzung und trägt jede gesehene URL ins Ledger ein.
 */
import type { UsageTracker } from '../usage.js';
import type { PageFetcher } from './fetchPage.js';
import { publisherFromHost, type SourceLedger } from './ledger.js';
import type { SearchEngine } from './search.js';
import { isClientOwned } from './text.js';

export interface ResearchDeps {
  search: SearchEngine;
  fetcher: PageFetcher;
}

export class ResearchSession {
  constructor(
    private readonly deps: ResearchDeps,
    private readonly ledger: SourceLedger,
    private readonly usage: UsageTracker,
    private readonly clientDomains: string[],
    private readonly clientKey: string,
  ) {}

  private ownership(url: string): string {
    return isClientOwned(url, this.clientDomains, this.clientKey) ? 'client-owned' : 'independent';
  }

  async webSearch(query: string): Promise<{ text: string; isError: boolean }> {
    this.usage.searches++;
    const res = await this.deps.search.search(query);
    if (!res.ok) return { text: res.error, isError: true };
    for (const h of res.hits) {
      this.ledger.record({ url: h.url, title: h.title, publisher: publisherFromHost(h.url), date: null, kind: 'search', text: h.snippet });
    }
    const lines = res.hits.map(
      (h, i) => `${i + 1}. ${h.title}\n   URL: ${h.url} [${this.ownership(h.url)}]\n   ${h.snippet}`,
    );
    const notes: string[] = [];
    if (res.dropped.length) notes.push(`Removed results from people-data aggregators (not allowed as sources): ${res.dropped.join(', ')}.`);
    if (!res.hits.length) notes.push('No results. Try a different query (max. 2 attempts per data point), then record the gap.');
    return { text: [`Results for "${query}":`, ...lines, ...notes].join('\n'), isError: false };
  }

  async fetchPage(url: string): Promise<{ text: string; isError: boolean }> {
    this.usage.fetches++;
    const res = await this.deps.fetcher.fetch(url);
    if (!res.ok) return { text: `Could not fetch ${url}: ${res.error}`, isError: true };
    this.ledger.record(
      { url: res.url, title: res.title || publisherFromHost(res.url), publisher: publisherFromHost(res.url), date: res.date, kind: 'fetched', text: res.text, paywalled: res.paywalled },
      [url],
    );
    return {
      text: [
        `URL: ${res.url} [${this.ownership(res.url)}]`,
        `Title: ${res.title || '(none)'}`,
        `Published: ${res.date ?? 'unknown (cite with date n.d.)'}`,
        ...(res.paywalled ? ['Note: paywalled publisher – text may be partial; corroborate numbers with a free source.'] : []),
        '',
        res.text,
      ].join('\n'),
      isError: false,
    };
  }
}

/**
 * DuckDuckGo-HTML-Suche (kein API-Key). Portiert aus RFP_Tool25 `_search_duckduckgo`:
 * GET html.duckduckgo.com/html/?q=…, Treffer aus `a.result__a` (uddg-Redirect dekodiert)
 * und `.result__snippet`.
 *
 * Schutz vor Blockade: prozessweit serialisiert mit ≥ 1,2 s Abstand, 24-h-Cache pro Query,
 * max. 2 Versuche bei Netzwerkfehlern, Captcha/„anomaly“-Seite → Fehlermeldung + Cooldown
 * (keine Schleife, kein Captcha-Umgehen).
 */
import { BROWSER_UA, defaultHttpGet, type HttpGet } from './http.js';
import { createSerialLimiter, TtlCache } from './limits.js';
import { decodeEntities, hostOf, stripTags } from './text.js';
import { blockedDomainReason } from './policy.js';

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export type SearchOutcome =
  | { ok: true; hits: SearchHit[]; cached: boolean; dropped: string[] }
  | { ok: false; error: string };

export interface SearchEngine {
  search(query: string): Promise<SearchOutcome>;
}

const DDG_URL = 'https://html.duckduckgo.com/html/';
const MAX_HITS = 8;
const BLOCK_COOLDOWN_MS = 10 * 60_000;

/** Erkennt Captcha-/Anomaly-Seiten (DDG liefert dabei HTTP 202). */
export function isDdgBlocked(status: number, html: string): boolean {
  if (status !== 200) return true;
  return /anomaly\.js|challenge-form|bots use DuckDuckGo|complete the following challenge/i.test(html);
}

/** Löst DDG-Redirects (//duckduckgo.com/l/?uddg=…) auf; null für Anzeigen/ungültige Links. */
export function decodeDdgHref(rawHref: string): string | null {
  const href = decodeEntities(rawHref);
  if (/duckduckgo\.com\/y\.js|ad_domain=|ad_provider=/.test(href)) return null;
  let target = href;
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (m) {
    try {
      target = decodeURIComponent(m[1]);
    } catch {
      return null;
    }
  }
  if (target.startsWith('//')) target = `https:${target}`;
  if (!/^https?:\/\//i.test(target)) return null;
  if (/^https?:\/\/([a-z0-9-]+\.)*duckduckgo\.com\//i.test(target)) return null;
  return target.split('#')[0];
}

/** Parst die HTML-Ergebnisliste (rein, testbar). */
export function parseDuckDuckGoHtml(html: string, max = MAX_HITS): SearchHit[] {
  const anchorRe = /<a\b[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*>[\s\S]*?<\/a>/gi;
  const anchors = [...html.matchAll(anchorRe)];
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  anchors.forEach((m, i) => {
    if (hits.length >= max) return;
    const tag = m[0];
    const hrefMatch = tag.match(/\bhref\s*=\s*"([^"]*)"/i);
    const url = hrefMatch ? decodeDdgHref(hrefMatch[1]) : null;
    if (!url || seen.has(url)) return;
    const start = (m.index ?? 0) + tag.length;
    const end = anchors[i + 1]?.index ?? html.length;
    const chunk = html.slice(start, end);
    const snippetMatch = chunk.match(/class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/i);
    seen.add(url);
    hits.push({
      title: stripTags(tag),
      url,
      snippet: snippetMatch ? stripTags(snippetMatch[1]).slice(0, 400) : '',
    });
  });
  return hits;
}

export interface DuckDuckGoDeps {
  httpGet?: HttpGet;
  /** Serialisierung; Default: prozessweiter Limiter. */
  schedule?: <T>(task: () => Promise<T>) => Promise<T>;
  cache?: TtlCache<SearchHit[]>;
  now?: () => number;
}

const sharedSchedule = createSerialLimiter(Number(process.env.BRIEFING_DDG_INTERVAL_MS) || 1_200);
const sharedCache = new TtlCache<SearchHit[]>(24 * 60 * 60_000);
let sharedBlockedUntil = 0;

export function createDuckDuckGoSearch(deps: DuckDuckGoDeps = {}): SearchEngine {
  const httpGet = deps.httpGet ?? defaultHttpGet;
  const schedule = deps.schedule ?? sharedSchedule;
  const cache = deps.cache ?? sharedCache;
  const now = deps.now ?? Date.now;
  const isShared = !deps.cache;
  let localBlockedUntil = 0;
  const blockedUntil = () => (isShared ? sharedBlockedUntil : localBlockedUntil);
  const setBlocked = (t: number) => {
    if (isShared) sharedBlockedUntil = t;
    else localBlockedUntil = t;
  };

  return {
    async search(rawQuery: string): Promise<SearchOutcome> {
      const query = rawQuery.replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!query) return { ok: false, error: 'Empty query.' };
      const key = query.toLowerCase();
      const cached = cache.get(key);
      if (cached) return finalize(cached, true);
      if (blockedUntil() > now()) {
        return { ok: false, error: 'Web search is temporarily blocked by DuckDuckGo (captcha). Do not retry; use fetch_page on known URLs or record the gap.' };
      }

      let lastError = '';
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await schedule(() =>
            httpGet(`${DDG_URL}?q=${encodeURIComponent(query)}`, {
              timeoutMs: 12_000,
              headers: { 'User-Agent': BROWSER_UA, Referer: 'https://html.duckduckgo.com/' },
            }),
          );
          if (isDdgBlocked(res.status, res.text)) {
            setBlocked(now() + BLOCK_COOLDOWN_MS);
            return { ok: false, error: `Web search blocked (DuckDuckGo returned HTTP ${res.status} / captcha). Do not retry; use fetch_page on known URLs or record the gap with the routes tried.` };
          }
          const hits = parseDuckDuckGoHtml(res.text);
          cache.set(key, hits);
          return finalize(hits, false);
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
      }
      return { ok: false, error: `Web search failed twice (${lastError.slice(0, 120)}). Do not retry this query.` };
    },
  };
}

function finalize(hits: SearchHit[], cached: boolean): SearchOutcome {
  const dropped: string[] = [];
  const kept = hits.filter((h) => {
    const reason = blockedDomainReason(h.url);
    if (reason) dropped.push(hostOf(h.url));
    return !reason;
  });
  return { ok: true, hits: kept, cached, dropped: [...new Set(dropped)] };
}

/** Nur für Tests: Zustand des prozessweiten Suchers zurücksetzen. */
export function resetSharedSearchStateForTests(): void {
  sharedCache.clear();
  sharedBlockedUntil = 0;
}

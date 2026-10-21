/**
 * fetch_page: Seite SSRF-sicher abrufen (safeFetch), lesbaren Text (≤ 8k Zeichen) und
 * Veröffentlichungsdatum extrahieren. Aggregatoren und PDFs werden abgelehnt.
 */
import { defaultHttpGet, type HttpGet } from './http.js';
import { TtlCache } from './limits.js';
import { blockedDomainReason, isPaywalled } from './policy.js';
import { attr, formatMonYear, stripTags } from './text.js';

export const PAGE_TEXT_CAP = 8_000;

export interface PageContent {
  url: string;
  title: string;
  text: string;
  /** "Mon YYYY" oder null, wenn die Seite kein Datum ausweist. */
  date: string | null;
  paywalled: boolean;
}

export type FetchOutcome = ({ ok: true } & PageContent) | { ok: false; error: string };

export interface PageFetcher {
  fetch(url: string): Promise<FetchOutcome>;
}

const DATE_META_KEYS = [
  'article:published_time',
  'og:published_time',
  'datepublished',
  'publish-date',
  'publishdate',
  'pubdate',
  'date',
  'dc.date.issued',
  'dc.date',
  'parsely-pub-date',
  'sailthru.date',
  'article:modified_time',
  'og:updated_time',
  'last-modified',
];

/** Veröffentlichungsdatum aus Meta-Tags, JSON-LD oder <time datetime> (rein). */
export function extractPublishedDate(html: string): string | null {
  const meta = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, 'property') ?? attr(tag, 'name') ?? attr(tag, 'itemprop') ?? '').toLowerCase();
    const content = attr(tag, 'content');
    if (key && content && !meta.has(key)) meta.set(key, content);
  }
  for (const key of DATE_META_KEYS.slice(0, 11)) {
    const d = formatMonYear(meta.get(key));
    if (d) return d;
  }
  for (const field of ['datePublished', 'dateCreated', 'dateModified']) {
    const m = html.match(new RegExp(`"${field}"\\s*:\\s*"([^"]{8,40})"`));
    const d = formatMonYear(m?.[1]);
    if (d) return d;
  }
  for (const key of DATE_META_KEYS.slice(11)) {
    const d = formatMonYear(meta.get(key));
    if (d) return d;
  }
  const time = html.match(/<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["']/i);
  return formatMonYear(time?.[1]);
}

/** Lesbarer Haupttext (rein): article/main bevorzugt, Navigation/Skripte entfernt. */
export function extractReadable(html: string): { title: string; text: string } {
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const ogTitle = html.match(/<meta\b[^>]*property=["']og:title["'][^>]*>/i);
  const title = stripTags(titleTag?.[1] ?? '') || (ogTitle ? attr(ogTitle[0], 'content') ?? '' : '');
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|form|nav|footer|header|aside)\b[\s\S]*?<\/\1>/gi, ' ');
  const pick = (tag: string) => {
    const blocks = [...cleaned.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))];
    return blocks.map((b) => b[1]).join(' ');
  };
  const body = cleaned.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? cleaned;
  let main = stripTags(pick('article'));
  if (main.length < 400) main = stripTags(pick('main'));
  if (main.length < 400) main = stripTags(body.replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '$& \n'));
  return { title: title.slice(0, 200), text: main.slice(0, PAGE_TEXT_CAP) };
}

export interface PageFetcherDeps {
  httpGet?: HttpGet;
  cache?: TtlCache<PageContent>;
}

const sharedPageCache = new TtlCache<PageContent>(6 * 60 * 60_000, 500);

export function createPageFetcher(deps: PageFetcherDeps = {}): PageFetcher {
  const httpGet = deps.httpGet ?? defaultHttpGet;
  const cache = deps.cache ?? sharedPageCache;
  return {
    async fetch(url: string): Promise<FetchOutcome> {
      let parsed: URL;
      try {
        parsed = new URL(url.trim());
      } catch {
        return { ok: false, error: 'Invalid URL.' };
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, error: 'Only http(s) URLs can be fetched.' };
      const blocked = blockedDomainReason(parsed.toString());
      if (blocked) return { ok: false, error: `Blocked: ${blocked}` };
      if (/\.pdf($|\?)/i.test(parsed.pathname)) {
        return { ok: false, error: 'PDFs are not fetched (unreadable). Use the HTML version, a press write-up, or record the gap.' };
      }
      const key = parsed.toString();
      const hit = cache.get(key);
      if (hit) return { ok: true, ...hit };

      let lastError = '';
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await httpGet(key, { timeoutMs: 15_000, maxBytes: 3 * 1024 * 1024 });
          if (res.status === 403 || res.status === 401 || res.status === 429) {
            return { ok: false, error: `HTTP ${res.status} (bot-blocked or login required). Do not retry; cite the search snippet instead or record the gap.` };
          }
          if (res.status < 200 || res.status >= 300) return { ok: false, error: `HTTP ${res.status}.` };
          if (/application\/pdf/i.test(res.contentType)) return { ok: false, error: 'Response is a PDF (not readable).' };
          if (res.contentType && !/html|text|json|xml/i.test(res.contentType)) {
            return { ok: false, error: `Unsupported content type ${res.contentType}.` };
          }
          const { title, text } = extractReadable(res.text);
          if (text.length < 80) return { ok: false, error: 'Page has almost no readable text (JS-only or blocked).' };
          const page: PageContent = {
            url: res.url || key,
            title,
            text,
            date: extractPublishedDate(res.text),
            paywalled: isPaywalled(res.url || key),
          };
          cache.set(key, page);
          return { ok: true, ...page };
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          if (/Blocked URL/.test(lastError)) return { ok: false, error: 'URL not allowed (private or unresolvable address).' };
        }
      }
      return { ok: false, error: `Fetch failed twice (${lastError.slice(0, 120)}). Do not retry.` };
    },
  };
}

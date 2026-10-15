import { safeFetch } from '../utils/safeFetch.js';
import { localeForUrl } from '../utils/locale.js';
import type { ScrapedData } from './scraper.js';

/**
 * Fallback-Scrape ohne Browser: einfacher, SSRF-sicherer HTTP-GET (safeFetch) mit
 * Regex-Extraktion der Felder, die die Detektoren brauchen. Wird genutzt, wenn der
 * Scrapling-Worker abstürzt oder nicht startet – liefert weniger (kein JS, keine
 * Netzwerk-Requests), aber besser als ein Totalausfall.
 */

const TIMEOUT_MS = 20_000;
const MAX_HTML_CHARS = 2_000_000;
const MAX_BODY_TEXT_CHARS = 50_000;
const MAX_LINKS = 500;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  const v = m?.[1] ?? m?.[2] ?? m?.[3];
  return v === undefined ? undefined : decodeEntities(v);
}

function absolutize(value: string, base: string): string {
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

/** Extrahiert ScrapedData-Felder aus rohem HTML (rein, gut testbar). */
export function extractFromHtml(
  html: string,
  requestedUrl: string,
  finalUrl: string,
  headers: Record<string, string[]>,
  status: number,
): ScrapedData {
  const meta: Record<string, string[]> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = attr(tag, 'name') ?? attr(tag, 'property') ?? attr(tag, 'http-equiv');
    const content = attr(tag, 'content');
    if (name && content) (meta[name] ??= []).push(content);
  }

  const scriptSrc: string[] = [];
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    const src = attr(tag, 'src');
    if (src) scriptSrc.push(src);
  }

  const links: string[] = [];
  for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
    const href = attr(tag, 'href');
    if (!href || /^(?:#|javascript:|mailto:|tel:|data:)/i.test(href)) continue;
    const abs = absolutize(href, finalUrl);
    if (/^https?:/i.test(abs)) links.push(abs);
    if (links.length >= MAX_LINKS) break;
  }

  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '');
  const bodyHtml = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  const bodyText = decodeEntities(
    bodyHtml
      .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  ).slice(0, MAX_BODY_TEXT_CHARS);

  const cookies: Record<string, string> = {};
  for (const raw of headers['set-cookie'] ?? []) {
    const [pair] = raw.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }

  return {
    url: requestedUrl,
    finalUrl,
    html: html.slice(0, MAX_HTML_CHARS),
    headers,
    meta,
    scriptSrc: scriptSrc.map((s) => absolutize(s, finalUrl)),
    cookies,
    title,
    bodyText,
    links,
    requests: [],
    jsGlobals: {},
    edgeSignals: [],
    status,
    scrapeMode: 'http',
  };
}

export async function httpFallbackScrape(url: string): Promise<ScrapedData> {
  const { acceptLanguage } = localeForUrl(url);
  const res = await safeFetch(url, {
    timeoutMs: TIMEOUT_MS,
    maxBodyBytes: 8 * 1024 * 1024,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': acceptLanguage,
      'Accept-Encoding': 'gzip, deflate, br',
    },
  });
  const headers: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === undefined) continue;
    headers[key.toLowerCase()] = Array.isArray(value) ? value.map(String) : [String(value)];
  }
  return extractFromHtml(res.text, url, res.url, headers, res.status);
}

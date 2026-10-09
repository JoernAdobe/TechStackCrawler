import type { MobileAppInfo, MobileAppsResult } from '../types/parity.js';
import { safeFetch } from '../utils/safeFetch.js';
import { sanitizeUrlWithDns } from '../utils/sanitize.js';

/**
 * Mobile-App-Erkennung für eine Website:
 * 1. Store-Links + Smart-Banner-Metas im HTML.
 * 2. Apple-Details via iTunes Lookup API.
 * 3. Ohne Links: iTunes Search API (entity=software) nach Marke, streng gefiltert.
 * Google Play hat keine offizielle Public-API → nur Package-ID + Store-Link.
 */

const ITUNES_LOOKUP = 'https://itunes.apple.com/lookup';
const ITUNES_SEARCH = 'https://itunes.apple.com/search';
const API_TIMEOUT_MS = 20_000;
const PAGE_TIMEOUT_MS = 20_000;
const MAX_APPS_PER_STORE = 10;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export interface AppLink {
  store: 'apple' | 'google';
  appId: string;
  foundVia: 'website-link' | 'smart-banner-meta';
}

export interface FindMobileAppsInput {
  url: string;
  brand?: string;
  html?: string;
  country?: string;
}

interface ItunesApp {
  trackId?: number;
  trackName?: string;
  sellerName?: string;
  artistName?: string;
  trackViewUrl?: string;
  artworkUrl512?: string;
  artworkUrl100?: string;
  artworkUrl60?: string;
  averageUserRating?: number;
  userRatingCount?: number;
  version?: string;
  currentVersionReleaseDate?: string;
  primaryGenreName?: string;
  kind?: string;
  wrapperType?: string;
}

const APPLE_LINK_RE = /(?:apps|itunes)\.apple\.com\/[^"'\s<>]*?\bid(\d{5,12})\b/gi;
const GOOGLE_LINK_RE =
  /play\.google\.com\/store\/apps\/details\?(?:[^"'\s<>]*?&(?:amp;)?)?id=([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)/gi;
const META_RE = /<meta\b[^>]*>/gi;

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

function metaAppId(content: string | undefined): string | undefined {
  return content ? /app-id\s*=\s*([^,\s]+)/i.exec(content)?.[1] : undefined;
}

/** Reine Extraktion von Store-Links und Smart-Banner-Metas aus HTML (dedupliziert). */
export function extractAppLinks(html: string): AppLink[] {
  const found = new Map<string, AppLink>();
  const add = (link: AppLink) => {
    const key = `${link.store}:${link.store === 'google' ? link.appId : link.appId.toLowerCase()}`;
    const existing = found.get(key);
    // Smart-Banner ist das stärkere Signal (offizielle App der Seite).
    if (!existing || (link.foundVia === 'smart-banner-meta' && existing.foundVia !== 'smart-banner-meta')) {
      found.set(key, link);
    }
  };

  for (const tag of html.match(META_RE) ?? []) {
    const name = attr(tag, 'name')?.toLowerCase();
    if (name !== 'apple-itunes-app' && name !== 'google-play-app') continue;
    const id = metaAppId(attr(tag, 'content'));
    if (!id) continue;
    if (name === 'apple-itunes-app' && /^\d{5,12}$/.test(id)) {
      add({ store: 'apple', appId: id, foundVia: 'smart-banner-meta' });
    } else if (name === 'google-play-app' && /^[A-Za-z][\w]*(\.[\w]+)+$/.test(id)) {
      add({ store: 'google', appId: id, foundVia: 'smart-banner-meta' });
    }
  }

  for (const m of html.matchAll(APPLE_LINK_RE)) {
    add({ store: 'apple', appId: m[1], foundVia: 'website-link' });
  }
  for (const m of html.matchAll(GOOGLE_LINK_RE)) {
    add({ store: 'google', appId: m[1], foundVia: 'website-link' });
  }
  return [...found.values()];
}

/** Leitet eine Marke aus der Domain ab (z. B. "https://www.otto.de" → "otto"). */
export function brandFromUrl(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '');
    const label = host.split('.')[0];
    return label && label.length >= 2 ? label : undefined;
  } catch {
    return undefined;
  }
}

/** True, wenn Publisher oder App-Name die Marke (case-insensitive) enthält. */
export function matchesBrand(app: ItunesApp, brand: string): boolean {
  const needle = brand.trim().toLowerCase();
  if (!needle) return false;
  return [app.sellerName, app.artistName, app.trackName].some((v) => v?.toLowerCase().includes(needle));
}

export function mapItunesApp(app: ItunesApp, foundVia: MobileAppInfo['foundVia']): MobileAppInfo | null {
  if (!app.trackId || !app.trackName) return null;
  const info: MobileAppInfo = {
    store: 'apple',
    appId: String(app.trackId),
    name: app.trackName,
    storeUrl: app.trackViewUrl ?? `https://apps.apple.com/app/id${app.trackId}`,
    foundVia,
  };
  const publisher = app.sellerName ?? app.artistName;
  if (publisher) info.publisher = publisher;
  const icon = app.artworkUrl512 ?? app.artworkUrl100 ?? app.artworkUrl60;
  if (icon) info.iconUrl = icon;
  if (typeof app.averageUserRating === 'number') info.rating = Math.round(app.averageUserRating * 10) / 10;
  if (typeof app.userRatingCount === 'number') info.ratingCount = app.userRatingCount;
  if (app.version) info.version = app.version;
  if (app.currentVersionReleaseDate) info.lastUpdated = app.currentVersionReleaseDate;
  if (app.primaryGenreName) info.genre = app.primaryGenreName;
  return info;
}

function googleApp(link: AppLink): MobileAppInfo {
  return {
    store: 'google',
    appId: link.appId,
    name: link.appId,
    storeUrl: `https://play.google.com/store/apps/details?id=${encodeURIComponent(link.appId)}`,
    foundVia: link.foundVia,
  };
}

function normCountry(country?: string): string | undefined {
  const c = country?.trim().toLowerCase();
  return c && /^[a-z]{2}$/.test(c) ? c : undefined;
}

async function itunesGet(base: string, params: Record<string, string>): Promise<ItunesApp[]> {
  const res = await fetch(`${base}?${new URLSearchParams(params).toString()}`, {
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`iTunes API HTTP ${res.status}`);
  const json = (await res.json()) as { results?: ItunesApp[] };
  return Array.isArray(json.results) ? json.results : [];
}

async function lookupApple(ids: string[], country?: string): Promise<Map<string, ItunesApp>> {
  const byId = new Map<string, ItunesApp>();
  const collect = (apps: ItunesApp[]) => {
    for (const a of apps) if (a.trackId) byId.set(String(a.trackId), a);
  };
  collect(await itunesGet(ITUNES_LOOKUP, { id: ids.join(','), ...(country ? { country } : {}) }));
  // Apps, die im Länder-Store fehlen, im Default-Store (US) nachschlagen.
  const missing = ids.filter((id) => !byId.has(id));
  if (country && missing.length) collect(await itunesGet(ITUNES_LOOKUP, { id: missing.join(',') }));
  return byId;
}

async function loadHtml(url: string): Promise<string> {
  const safe = await sanitizeUrlWithDns(url);
  if (!safe) throw new Error('URL blocked by sanitizer');
  const res = await safeFetch(safe, {
    timeoutMs: PAGE_TIMEOUT_MS,
    maxBodyBytes: 5 * 1024 * 1024,
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function findMobileApps(input: FindMobileAppsInput): Promise<MobileAppsResult> {
  const notes: string[] = [];
  const apps: MobileAppInfo[] = [];
  const country = normCountry(input.country);

  let html = input.html;
  if (html === undefined) {
    try {
      html = await loadHtml(input.url);
    } catch (err) {
      notes.push(`Website could not be loaded: ${errText(err)}`);
      html = '';
    }
  }

  const links = extractAppLinks(html);
  const appleLinks = links.filter((l) => l.store === 'apple').slice(0, MAX_APPS_PER_STORE);
  const googleLinks = links.filter((l) => l.store === 'google').slice(0, MAX_APPS_PER_STORE);

  if (appleLinks.length) {
    try {
      const details = await lookupApple(appleLinks.map((l) => l.appId), country);
      for (const link of appleLinks) {
        const mapped = details.get(link.appId) && mapItunesApp(details.get(link.appId)!, link.foundVia);
        apps.push(
          mapped || {
            store: 'apple',
            appId: link.appId,
            name: `App ${link.appId}`,
            storeUrl: `https://apps.apple.com/app/id${link.appId}`,
            foundVia: link.foundVia,
          },
        );
        if (!mapped) notes.push(`Apple app id${link.appId} not found via iTunes Lookup`);
      }
    } catch (err) {
      notes.push(`iTunes Lookup failed: ${errText(err)}`);
      for (const link of appleLinks) {
        apps.push({
          store: 'apple',
          appId: link.appId,
          name: `App ${link.appId}`,
          storeUrl: `https://apps.apple.com/app/id${link.appId}`,
          foundVia: link.foundVia,
        });
      }
    }
  }

  apps.push(...googleLinks.map(googleApp));

  if (links.length === 0) {
    const brand = input.brand?.trim() || brandFromUrl(input.url);
    if (!brand) {
      notes.push('No app links found and no brand available for store search');
    } else {
      try {
        const results = await itunesGet(ITUNES_SEARCH, {
          term: brand,
          entity: 'software',
          limit: '5',
          ...(country ? { country } : {}),
        });
        for (const r of results.filter((a) => matchesBrand(a, brand))) {
          const mapped = mapItunesApp(r, 'store-search');
          if (mapped) apps.push(mapped);
        }
        notes.push(
          `No app links on the website – searched the App Store for "${brand}" (${apps.length} match${apps.length === 1 ? '' : 'es'})`,
        );
      } catch (err) {
        notes.push(`iTunes Search failed: ${errText(err)}`);
      }
    }
  }

  return { fetchedAt: new Date().toISOString(), apps, ...(notes.length ? { notes } : {}) };
}

import { promises as dns } from 'node:dns';
import { DETECTION_RULES, type DetectedTech } from './customDetectors.js';
import type { ScrapedData } from './scraper.js';

/**
 * DNS-/CNAME-Analyse der First-Party-Hosts einer Seite.
 *
 * CNAMEs verraten Plattformen, die im HTML unsichtbar sind: AEM as a Cloud Service
 * (cdn.adobeaemcloud.com), First-Party-Tracking (smetrics → *.sc.omtrdc.net), CDN,
 * Commerce-Backends. Nur DNS-Auflösung von Hosts, die die Seite ohnehin kontaktiert –
 * es werden keine zusätzlichen Verbindungen aufgebaut.
 */

export type CnameResolver = (host: string) => Promise<string[]>;

interface CnameTarget {
  pattern: RegExp;
  tech: string;
  label: string;
}

const CNAME_TARGETS: CnameTarget[] = [
  { pattern: /(^|\.)adobeaemcloud\.(com|net)$/, tech: 'Adobe Experience Manager', label: 'AEM as a Cloud Service CDN' },
  { pattern: /(^|\.)(aem|hlx)\.(live|page)$/, tech: 'Adobe Experience Manager (Edge Delivery Services)', label: 'Edge Delivery Services origin' },
  { pattern: /\.sc\.omtrdc\.net$|\.2o7\.net$/, tech: 'Adobe Analytics', label: 'First-party Analytics tracking CNAME' },
  { pattern: /\.tt\.omtrdc\.net$/, tech: 'Adobe Target', label: 'First-party Target CNAME' },
  { pattern: /(^|\.)(magento\.cloud|magentosite\.cloud)$/, tech: 'Adobe Commerce (Magento)', label: 'Adobe Commerce Cloud hosting' },
  { pattern: /(^|\.)demandware\.net$/, tech: 'Salesforce Commerce Cloud', label: 'Salesforce Commerce Cloud (Demandware) hosting' },
  { pattern: /(^|\.)myshopify\.com$/, tech: 'Shopify', label: 'Shopify hosting' },
  { pattern: /(^|\.)ondemand\.com$/, tech: 'SAP Commerce Cloud (Hybris)', label: 'SAP cloud hosting' },
  { pattern: /(^|\.)(edgekey|edgesuite|akamaiedge|akamai|akamaized)\.net$/, tech: 'Akamai', label: 'Akamai edge' },
  { pattern: /(^|\.)cdn\.cloudflare\.net$/, tech: 'Cloudflare', label: 'Cloudflare proxy' },
  { pattern: /(^|\.)cloudfront\.net$/, tech: 'AWS CloudFront', label: 'CloudFront distribution' },
  { pattern: /(^|\.)(fastly\.net|fastlylb\.net)$/, tech: 'Fastly', label: 'Fastly edge' },
  { pattern: /(^|\.)(azureedge\.net|azurefd\.net)$/, tech: 'Azure CDN', label: 'Azure Front Door / CDN' },
  { pattern: /(^|\.)(incapdns\.net|impervadns\.net)$/, tech: 'Incapsula / Imperva', label: 'Imperva WAF' },
  { pattern: /(^|\.)vercel-dns\.com$/, tech: 'Vercel', label: 'Vercel hosting' },
  { pattern: /(^|\.)netlify\.(app|com)$/, tech: 'Netlify', label: 'Netlify hosting' },
  { pattern: /(^|\.)commander[1-9]\.com$/, tech: 'Commanders Act (TagCommander)', label: 'First-party TagCommander CNAME' },
];

const MAX_HOSTS = 15;
const MAX_HOPS = 4;
const LOOKUP_TIMEOUT_MS = 1_500;
const TOTAL_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 10 * 60_000;
const DNS_CONFIDENCE = 90;

const cache = new Map<string, { at: number; chain: string[] }>();

const defaultResolver: CnameResolver = (host) => dns.resolveCname(host);

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

function hostOf(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return /^[a-z0-9.-]+$/.test(host) && host.includes('.') ? host : undefined;
  } catch {
    return undefined;
  }
}

export function siteRoot(host: string): string {
  const parts = host.split('.');
  const sld = parts.at(-2) ?? '';
  const labels = parts.length > 2 && /^(co|com|org|net|gov|ac|or|ne)$/.test(sld) ? 3 : 2;
  return parts.slice(-labels).join('.');
}

/** First-Party-Hosts (gleiche registrierbare Domain), Haupt-Host zuerst. */
export function firstPartyHosts(scraped: ScrapedData): string[] {
  const main = hostOf(scraped.finalUrl) ?? hostOf(scraped.url);
  if (!main) return [];
  const root = siteRoot(main);
  const hosts = new Set<string>([main]);
  for (const url of [...(scraped.requests ?? []), ...scraped.scriptSrc]) {
    if (hosts.size >= MAX_HOSTS) break;
    const h = hostOf(url);
    if (h && (h === root || h.endsWith(`.${root}`))) hosts.add(h);
  }
  return [...hosts];
}

async function cnameChain(host: string, resolve: CnameResolver, useCache: boolean): Promise<string[]> {
  const hit = useCache ? cache.get(host) : undefined;
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.chain;
  const chain: string[] = [];
  let current = host;
  for (let i = 0; i < MAX_HOPS; i++) {
    const [next] = await withTimeout(resolve(current), LOOKUP_TIMEOUT_MS, [] as string[]);
    if (!next) break;
    const target = next.toLowerCase().replace(/\.$/, '');
    if (chain.includes(target)) break;
    chain.push(target);
    current = target;
  }
  if (useCache) cache.set(host, { at: Date.now(), chain });
  return chain;
}

export function classifyCnameChain(host: string, chain: string[]): { tech: string; evidence: string }[] {
  const out: { tech: string; evidence: string }[] = [];
  for (const target of CNAME_TARGETS) {
    const match = chain.find((c) => target.pattern.test(c));
    if (match && !out.some((o) => o.tech === target.tech)) {
      out.push({ tech: target.tech, evidence: `${target.label}: ${host} → ${match}` });
    }
  }
  return out;
}

export async function detectFromDns(
  scraped: ScrapedData,
  resolve: CnameResolver = defaultResolver,
): Promise<DetectedTech[]> {
  if (process.env.DNS_SIGNALS === '0') return [];
  const hosts = firstPartyHosts(scraped);
  const useCache = resolve === defaultResolver;
  const results = await withTimeout(
    Promise.all(hosts.map(async (h) => ({ host: h, chain: await cnameChain(h, resolve, useCache) }))),
    TOTAL_TIMEOUT_MS,
    [] as { host: string; chain: string[] }[],
  );

  const byTech = new Map<string, DetectedTech>();
  for (const { host, chain } of results) {
    for (const { tech, evidence } of classifyCnameChain(host, chain)) {
      const rule = DETECTION_RULES.find((r) => r.name === tech);
      if (!rule) continue;
      const entry = byTech.get(tech) ?? {
        name: tech,
        categories: [...rule.categories],
        confidence: DNS_CONFIDENCE,
        evidence: [],
      };
      if (entry.evidence!.length < 3) entry.evidence!.push(evidence);
      byTech.set(tech, entry);
    }
  }
  return [...byTech.values()];
}

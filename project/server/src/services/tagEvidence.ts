import type { ScrapedData } from './scraper.js';

/**
 * Deterministische Belege pro Technologie (IDs, Endpunkte, Versionen) aus Netzwerk,
 * Cookies und JS-Probes. Reine Funktion – nur Tracking-Konfiguration, keine Personendaten.
 */
export type EvidenceMap = Map<string, { evidence: string[]; version?: string }>;

const MAX_PER_TECH = 6;
const MAX_ITEM_CHARS = 140;

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function siteRoot(host: string | undefined): string | undefined {
  if (!host) return undefined;
  const parts = host.split('.');
  // bmw.co.uk → bmw.co.uk statt co.uk
  const sld = parts.at(-2) ?? '';
  const labels = parts.length > 2 && /^(co|com|org|net|gov|ac|or|ne)$/.test(sld) ? 3 : 2;
  return parts.slice(-labels).join('.');
}

function collect(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))];
}

function matchAll(sources: string[], re: RegExp, group = 1): string[] {
  const out: string[] = [];
  for (const s of sources) {
    for (const m of s.matchAll(re)) if (m[group]) out.push(m[group]);
  }
  return collect(out);
}

export function extractEvidence(scraped: ScrapedData): EvidenceMap {
  const map: EvidenceMap = new Map();
  const add = (tech: string, items: string[], version?: string) => {
    const clean = items.filter(Boolean).map((i) => i.slice(0, MAX_ITEM_CHARS));
    if (clean.length === 0 && !version) return;
    const entry = map.get(tech) ?? { evidence: [] };
    for (const item of clean) {
      if (!entry.evidence.includes(item) && entry.evidence.length < MAX_PER_TECH) entry.evidence.push(item);
    }
    if (version && !entry.version) entry.version = version;
    map.set(tech, entry);
  };

  const requests = scraped.requests ?? [];
  const scripts = scraped.scriptSrc;
  const js = scraped.jsGlobals ?? {};
  const cookieNames = Object.keys(scraped.cookies);
  const root = siteRoot(hostOf(scraped.finalUrl));
  const firstParty = (host: string) => !!root && host.endsWith(root);

  // ── Adobe Analytics ──
  const rsids = collect([
    ...matchAll(requests, /\/b\/ss\/([^/?#]+)\/\d+\//g).flatMap((r) => safeDecode(r).split(',')),
    ...(js['adobe.reportSuites']?.split(',') ?? []),
  ]);
  const aaHosts = collect(
    requests.filter((u) => /\/b\/ss\/[^/]+\/\d+\//.test(u)).map((u) => hostOf(u) ?? ''),
  );
  const beaconVersion = matchAll(requests, /\/b\/ss\/[^/]+\/\d+\/(?:JS-)?([\d.]+|H\.\d+)[/?]/g)[0];
  add(
    'Adobe Analytics',
    [
      ...(rsids.length ? [`Report suite(s): ${rsids.slice(0, 5).join(', ')}`] : []),
      ...aaHosts.map((h) => `Tracking server: ${h}${firstParty(h) ? ' (first-party CNAME)' : ''}`),
      ...(beaconVersion?.startsWith('H.') ? ['Legacy s_code (H-code) — end-of-life library'] : []),
    ],
    /^\d/.test(js['adobe.appmeasurement'] ?? '') ? js['adobe.appmeasurement'] : beaconVersion,
  );

  // ── ECID / IMS Org ──
  const orgIds = collect([
    ...cookieNames.flatMap((c) => {
      const m = safeDecode(c).match(/^(?:AMCV_|kndctr_)([0-9A-F]{24})[@_]AdobeOrg/i);
      return m ? [`${m[1].toUpperCase()}@AdobeOrg`] : [];
    }),
  ]);
  if (orgIds.length) {
    add('Adobe Experience Cloud Identity Service (ECID)', [`IMS Org: ${orgIds.join(', ')}`]);
    add('Adobe Experience Platform Web SDK', cookieNames.some((c) => c.startsWith('kndctr_')) ? [`IMS Org: ${orgIds.join(', ')}`] : []);
  }

  // ── Web SDK / Edge Network ──
  const edgeRequests = requests.filter((u) => /\/ee\/(?:[a-z0-9-]+\/)?v\d+\/(interact|collect)/i.test(u));
  const datastreams = matchAll(edgeRequests, /[?&]configId=([0-9a-f-]{36})/gi);
  const edgeHosts = collect(edgeRequests.map((u) => hostOf(u) ?? ''));
  const edge = scraped.edgeSignals ?? [];
  const providers = edge.filter((s) => s.startsWith('decisionProvider:')).map((s) => s.split(':')[1]);
  add('Adobe Experience Platform Web SDK', [
    ...datastreams.map((d) => `Datastream: ${d}`),
    ...edgeHosts.map((h) => `Edge domain: ${h}${firstParty(h) ? ' (first-party)' : ''}`),
    ...(providers.length ? [`Edge decisioning: ${providers.join(', ')}`] : []),
  ], js['adobe.alloy.version']);
  if (edge.includes('handle:activation:push')) {
    add('Adobe Real-Time CDP', ['Edge segmentation active (activation:push in Edge response)']);
  }
  if (providers.includes('AJO')) add('Adobe Journey Optimizer', ['Web/code-based experience delivered via Edge (decisionProvider AJO)']);
  if (providers.includes('TGT')) add('Adobe Target', ['Delivered via Web SDK / Edge (decisionProvider TGT)']);

  // ── Target ──
  const targetClients = matchAll([...requests, ...scripts], /\/\/([a-z0-9-]+)\.tt\.omtrdc\.net\//gi);
  add(
    'Adobe Target',
    [
      ...targetClients.map((c) => `Client code: ${c}`),
      ...(/^\d/.test(js['adobe.target'] ?? '') ? [`at.js ${js['adobe.target']}`] : []),
    ],
    /^\d/.test(js['adobe.target'] ?? '') ? js['adobe.target'] : undefined,
  );

  // ── Launch ──
  const launchLibs = matchAll(scripts, /assets\.adobedtm\.com\/([^?#]*launch-[^/?#]+)/g);
  add(
    'Adobe Experience Platform Tags (Launch)',
    [
      ...(js['adobe.launch.property'] ? [`Property: ${js['adobe.launch.property']}`] : []),
      ...(js['adobe.launch.env'] ? [`Environment: ${js['adobe.launch.env']}`] : []),
      ...launchLibs.slice(0, 2).map((l) => `Library: ${l}`),
    ],
    /^\d/.test(js['adobe.launch'] ?? '') ? js['adobe.launch'] : undefined,
  );
  if (js['adobe.launch.env'] && js['adobe.launch.env'] !== 'production') {
    add('Adobe Experience Platform Tags (Launch)', [`⚠ Non-production library live on site (${js['adobe.launch.env']})`]);
  }

  // ── AEM ──
  add('Adobe Experience Manager (Edge Delivery Services)', requests.some((u) => /rum\.hlx\.page|\/\.rum\//.test(u)) ? ['Operational telemetry (RUM) beacon fired'] : []);

  // ── Google ──
  const gtmIds = collect([
    ...matchAll(scripts, /gtm\.js\?id=(GTM-[A-Z0-9]+)/g),
    ...(js['google.gtm']?.split(',') ?? []),
  ]);
  const gtmHosts = collect(scripts.filter((s) => /\/gtm\.js\?id=GTM-/.test(s)).map((s) => hostOf(s) ?? ''));
  add('Google Tag Manager', [
    ...(gtmIds.length ? [`Container(s): ${gtmIds.join(', ')}`] : []),
    ...gtmHosts.filter((h) => h !== 'www.googletagmanager.com').map((h) => `Server-side GTM via ${h}`),
  ]);
  const ga4Ids = collect([
    ...matchAll(requests, /\/g\/collect\?[^#]*?[?&]tid=(G-[A-Z0-9]+)/g),
    ...matchAll(scripts, /gtag\/js\?id=(G-[A-Z0-9]+)/g),
    ...(js['google.tags']?.split(',').filter((t) => t.startsWith('G-')) ?? []),
  ]);
  add('Google Analytics 4', ga4Ids.length ? [`Measurement ID(s): ${ga4Ids.slice(0, 5).join(', ')}`] : []);
  const uaIds = matchAll(requests, /[?&]tid=(UA-\d+-\d+)/g);
  add('Google Analytics (Universal)', uaIds.length ? [`⚠ Sunset property still firing: ${uaIds.join(', ')}`] : []);
  const awIds = collect(js['google.tags']?.split(',').filter((t) => t.startsWith('AW-')) ?? []);
  add('Google Ads', awIds.length ? [`Conversion ID(s): ${awIds.slice(0, 5).join(', ')}`] : []);

  // ── Tealium ──
  const utag = matchAll(scripts, /tags\.tiqcdn\.com\/utag\/([^/]+\/[^/]+\/[^/]+)\//g);
  add('Tealium iQ', utag.map((p) => `Account/profile/env: ${p}`), js['tealium.utag'] !== 'present' ? js['tealium.utag'] : undefined);

  // ── Pixels ──
  const fbIds = matchAll(requests, /facebook\.com\/tr\/?\?[^#]*?\bid=(\d{6,20})/g);
  add('Facebook / Meta Pixel', fbIds.length ? [`Pixel ID(s): ${fbIds.slice(0, 5).join(', ')}`] : []);

  // ── Generische Versionen aus JS-Probes ──
  for (const [tech, key] of Object.entries(VERSION_PROBES)) {
    const v = js[key];
    if (v && /^\d+(\.\d+)*/.test(v)) add(tech, [], v.match(/^\d+(\.\d+)*/)?.[0]);
  }

  return map;
}

const VERSION_PROBES: Record<string, string> = {
  'Adobe Experience Cloud Identity Service (ECID)': 'adobe.visitor',
  'Adobe Audience Manager': 'adobe.dil',
  Segment: 'segment',
  'Next.js': 'nextjs',
  'Vue.js': 'vue',
  jQuery: 'jquery',
};

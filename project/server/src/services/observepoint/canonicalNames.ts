/**
 * Namens-Normalisierung zwischen ObservePoint-Tags und TechStack-Detektionen.
 *
 * ObservePoint zerlegt ein Produkt oft in mehrere Sub-Tags ("OneTrust CMP Loader",
 * "OneTrust CMP Banner", …) und benennt Produkte anders als unser Detector
 * ("Adobe Launch" vs. "Adobe Experience Platform Tags (Launch)"). Beide Seiten werden
 * deshalb auf einen gemeinsamen Schlüssel abgebildet; Schlüssel = normalisierter TechStack-Name.
 */
import type { BuildingBlock } from '../../data/buildingBlocks.js';

/** Basis-Normalisierung: lowercase, Akzente/Sonderzeichen raus, Whitespace zusammenfassen. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\.(?=[a-z])/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** ObservePoint-Sub-Tag-Qualifier am Namensende (kein eigenes Produkt). Längere Folgen zuerst. */
const OP_QUALIFIERS = [
  'language configuration',
  'conversion tracking script',
  'dynamic variable',
  'page tracking',
  'action tracking',
  'page event',
  'modules loader',
  'events js bootstrap',
  'e merchandising',
  'deprecated',
  'bootstrap',
  'loader',
  'metadata',
  'banner',
  'assets',
  'configuration',
  'config',
  'geolocation',
  'collect',
  'interact',
  'pageview',
  'pixel',
  'event',
  'events',
  'recording',
  'transaction',
  'errors',
  'batching',
  'plugins',
  'reload',
  'script',
  'measure',
  'identify',
  'setup',
  'mobile',
  'pr',
].map((q) => q.split(' '));

/** Entfernt OP-Qualifier am Ende (mehrfach) und Doppelpunkt-Suffixe ("Tealium iQ: Sync Script"). */
export function stripOpQualifiers(name: string): string {
  let words = normalizeName(name.split(':')[0] ?? name).split(' ');
  let changed = true;
  while (changed && words.length > 1) {
    changed = false;
    for (const q of OP_QUALIFIERS) {
      if (words.length > q.length && q.every((w, i) => words[words.length - q.length + i] === w)) {
        words = words.slice(0, words.length - q.length);
        changed = true;
        break;
      }
    }
  }
  return words.join(' ');
}

/** Alias-Tabelle: TechStack-Name → bekannte Varianten (OP-Produktnamen, Kurzformen). */
const ALIAS_SOURCE: Array<[string, string[]]> = [
  ['Adobe Experience Platform Tags (Launch)', ['Adobe Launch', 'Adobe Extensions', 'Adobe TagManager', 'Adobe Experience Platform Launch']],
  ['Adobe Dynamic Tag Management (DTM, end-of-life)', ['Adobe DTM']],
  ['Adobe Experience Platform Web SDK', ['Adobe Experience Platform (AEP)', 'Alloy']],
  ['Adobe Experience Cloud Identity Service (ECID)', ['Adobe Experience Cloud ID', 'Adobe Visitor ID - FAST', 'Adobe Visitor ID']],
  ['Adobe Advertising Cloud', ['Adobe Advertising']],
  ['Adobe Fonts (Typekit)', ['Adobe Fonts']],
  ['Adobe Marketo Engage', ['Marketo Engage', 'Marketo']],
  ['Adobe Analytics', ['Adobe Video Heartbeat', 'AppMeasurement']],
  ['Google Analytics (Universal)', ['Google Analytics', 'Google Universal Analytics']],
  ['Google Ads', ['Google Ads Conversion Tracking', 'Google Ads Remarketing', 'Google AdService', 'Google AdWords']],
  ['Google AdSense', ['Google Adsense']],
  ['Google Ad Manager (DFP / DoubleClick)', ['Google Ad Manager (DFP)', 'Google Ad Manager (AdX)', 'Google Ad Manager']],
  ['Google Publisher Tag (GPT)', ['Google Publisher']],
  ['Google Marketing Platform', ['Floodlight Counter', 'Floodlight', 'Google Campaign Manager 360', 'Google Display & Video 360']],
  ['Facebook / Meta Pixel', ['Facebook Ad Measurement', 'Facebook Events JS Bootstrap', 'Facebook Event', 'Facebook Conversion']],
  ['LinkedIn Insight Tag', ['LinkedIn Insight', 'Linkedin Ads']],
  ['Microsoft Advertising (Bing UET)', ['Bing Ads', 'Bing Event Tracking', 'Bing Ad Loader', 'Bing Ads Conversion']],
  ['Tealium iQ', ['Tealium iQ: Tag Load Scripts']],
  ['Tealium AudienceStream', ['Tealium Collect']],
  ['Evergage / Salesforce Interaction Studio', ['Evergage', 'Interaction Studio']],
  ['Salesforce Marketing Cloud', ['SalesForce Email Studio']],
  ['Salesforce DMP (Krux)', ['SalesForce DMP', 'Salesforce Audience Studio']],
  ['Salesforce Live Agent / Messaging', ['Salesforce Chat']],
  ['OneTrust', ['OneTrust CMP']],
  ['Cookiebot', ['Cookiebot CMP']],
  ['Usercentrics', ['Usercentrics CMP']],
  ['Criteo', ['Criteo OneTag', 'Criteo Widget']],
  ['TikTok Pixel', ['TikTok Analytics', 'TikTok']],
  ['reCAPTCHA', ['Google reCAPTCHA']],
  ['Optimizely', ['Optimizely Active Event']],
  ['Pinterest Tag', ['Pinterest', 'Pinterest Event Listener']],
  ['Reddit Pixel', ['Reddit', 'Reddit Ads Loader']],
  ['Quora Pixel', ['Quora Loader', 'Quora Tracker']],
  ['Yahoo Advertising', ['Yahoo Ad Server', 'Yahoo Ad Exchange', 'Yahoo Ads (DEPRECATED)', 'Yahoo Rapid', 'Yahoo Analytics', 'Yahoo Tracker']],
  ['Eloqua', ['Oracle Eloqua']],
  ['mPulse (Akamai)', ['Akamai mPulse', 'Akamai Boomerang']],
  ['YouTube Embed', ['YouTube', 'YouTube Player', 'YouTube API']],
  ['Vimeo Embed', ['Vimeo', 'Vimeo Player']],
  // OP-Gap-Analyse (docs/library-research/02-observepoint-gap-analysis.md)
  ['The Trade Desk', ['TradeDesk', 'Trade Desk Universal']],
  ['Twitter / X Pixel', ['X Analytics', 'X Analytics Conversion', 'X Analytics Loader', 'X Conversion Tracker']],
  ['Twitter / X Widgets', ['X Widget']],
  ['AWS CloudFront', ['Amazon CloudFront CDN']],
  ['Snapchat Pixel', ['Snapchat Event Loader JS']],
  ['Adobe Dynamic Media', ['AEM Dynamic Media']],
  ['jQuery', ['Google APIs jQuery']],
  ['TripleLift', ['Triple Lift']],
  ['HubSpot Marketing', ['HubSpot Script Loader', 'HubSpot Analytics', 'HubSpot Analytics Loader', 'HubSpot Form', 'HubSpot Forms Loader', 'HubSpot Form Counter', 'HubSpot Chat']],
  ['HubSpot Cookie Banner', ['HubSpot CMP Banner']],
  ['VWO', ['Visual Website Optimizer', 'Visual Website Optimizer - Sampling']],
  ['Rakuten Advertising', ['Rakuten Marketing']],
  ['Consentmanager.net', ['consentmanager CMP', 'consentmanager CMP Loader']],
  ['Salesforce Commerce Cloud', ['CQuotient JS']],
  ['Ensighten', ['CHEQ Manage']],
  ['LivePerson', ['LiveEngage']],
  ['Awin', ['Affiliate Window']],
  ['Datadog RUM', ['Datadog Session Recording', 'Datadog Browser Logs']],
  ['ActionIQ', ['Action IQ']],
  ['Nielsen Digital Measurement (DCR/DAR)', ['NielsenOnline', 'Nielsen DCR']],
  // Zusammengeführte bzw. umbenannte Regeln – Alt-Namen aus gespeicherten Analysen bleiben vergleichbar.
  ['Insider', ['Insider CDP']],
  ['Mixpanel', ['Mixpanel CDP']],
  ['Coveo', ['Coveo Search']],
  ['Qubit', ['Qubit (now Coveo)']],
  ['Emarsys', ['Emarsys Personalization']],
  ['Lotame', ['Lotame Panorama ID']],
  ['Google Cloud (Load Balancer)', ['Google Cloud CDN']],
  // Nach Tealium AudienceStream, damit der Alt-Name „Tealium“ (gekürzt aus „Tealium Collect“) auf Tealium iQ fällt.
  ['Tealium iQ', ['Tealium']],
];

/** Reine Herstellernamen sind als Variante zu unspezifisch ("MOAT (Oracle)" darf nicht "Oracle …" fangen). */
const VENDOR_ONLY = new Set(['adobe', 'google', 'oracle', 'microsoft', 'amazon', 'meta', 'salesforce', 'sap', 'ibm', 'yahoo', 'verizon']);

/** Regel-Aliasse für OP-Tag-Familien, die nicht über Wortkürzung auflösbar sind. */
const PATTERN_ALIASES: Array<[RegExp, string]> = [
  // Social-Plugins sind das Facebook SDK, nicht das Meta-Pixel (sonst falsche Bestätigung).
  [/^facebook (like|send|subscribe|comments|feed|recommendations|login|registration|facepile|graph|oauth|audience network)/, 'Facebook SDK'],
];

const ALIASES = new Map<string, string>();
for (const [canonical, aliases] of ALIAS_SOURCE) {
  const key = normalizeName(canonical);
  ALIASES.set(key, key);
  for (const a of aliases) {
    ALIASES.set(normalizeName(a), key);
    ALIASES.set(stripOpQualifiers(a), key);
  }
}

/** OP-Hilfs-Tags ohne eigenen Produktwert. */
const IGNORED_OP_TAGS = new Set(
  [
    'Data Layer',
    // Infrastruktur/Monitoring ohne Martech-Produktwert bzw. unzuverlässige OP-Signatur (02-observepoint-gap-analysis).
    'Google Media',
    'Google APIs',
    'Google Security Scripts',
    'ipify API',
    'PebblePost',
    'Tag Inspector Realtime',
    'Everest.js',
  ].map(normalizeName),
);

export function isIgnoredOpTag(name: string): boolean {
  return IGNORED_OP_TAGS.has(normalizeName(name));
}

/** Namensvarianten eines TechStack-Namens: voll, ohne Klammern, Klammerinhalt, "/"-Teile. */
function techstackVariants(name: string): string[] {
  const variants = new Set<string>([name]);
  const withoutParens = name.replace(/\s*\([^)]*\)/g, '').trim();
  if (withoutParens) variants.add(withoutParens);
  for (const m of name.matchAll(/\(([^)]*)\)/g)) {
    for (const part of (m[1] ?? '').split(/[,/]/)) if (part.trim()) variants.add(part.trim());
  }
  for (const part of withoutParens.split('/')) if (part.trim()) variants.add(part.trim());
  return [...variants];
}

/** Kanonischer Schlüssel eines TechStack-Namens. */
export function canonicalKeyForTechstack(name: string): string {
  const full = normalizeName(name);
  return ALIASES.get(full) ?? full;
}

/**
 * Index über alle TechStack-Namen (Variante → kanonischer Schlüssel), damit OP-Namen wie
 * "Cookiebot CMP" oder "Twitter" ohne eigene Alias-Pflege auf unsere Namen fallen.
 */
export class TechstackNameIndex {
  private readonly byVariant = new Map<string, string>();
  private readonly keys = new Map<string, string>();

  constructor(names: Iterable<string>) {
    for (const name of names) {
      const key = canonicalKeyForTechstack(name);
      if (!this.keys.has(key)) this.keys.set(key, name);
      for (const v of techstackVariants(name)) {
        const nv = normalizeName(v);
        const isPart = nv !== normalizeName(name);
        if (isPart && VENDOR_ONLY.has(nv)) continue;
        // Erster Treffer gewinnt, damit mehrdeutige Kurzformen stabil bleiben.
        if (nv.length >= 3 && !this.byVariant.has(nv)) this.byVariant.set(nv, key);
      }
    }
  }

  /**
   * Kanonischer Schlüssel eines OP-Tags. Reihenfolge: Aliasse → Regel-Aliasse → TechStack-Varianten →
   * schrittweises Kürzen um Zusatzwörter ("Heap Analytics" → "Heap", "Drupal CMS" → "Drupal").
   * Fallback: OP-Produktname ohne Qualifier.
   */
  resolveObservePoint(opName: string): string {
    const full = normalizeName(opName);
    const stripped = stripOpQualifiers(opName);
    const aliased = ALIASES.get(full) ?? ALIASES.get(stripped);
    if (aliased) return aliased;
    for (const [re, target] of PATTERN_ALIASES) {
      if (re.test(full)) return canonicalKeyForTechstack(target);
    }
    const direct = this.byVariant.get(full) ?? this.byVariant.get(stripped);
    if (direct) return direct;
    const words = stripped.split(' ');
    for (let n = words.length - 1; n >= 1; n--) {
      const candidate = words.slice(0, n).join(' ');
      if (candidate.length < 4) break;
      if (VENDOR_ONLY.has(candidate)) continue;
      const hit = ALIASES.get(candidate) ?? this.byVariant.get(candidate);
      if (hit) return hit;
    }
    return stripped;
  }

  /** Kanonischer Schlüssel eines TechStack-Namens. */
  resolveTechstack(name: string): string {
    return canonicalKeyForTechstack(name);
  }

  /** true, wenn der Schlüssel zu einer indizierten TechStack-Technologie gehört. */
  knows(key: string): boolean {
    return this.keys.has(key);
  }

  /** Erster TechStack-Name zu einem kanonischen Schlüssel (für die Anzeige). */
  displayName(key: string): string | undefined {
    return this.keys.get(key);
  }
}

/** ObservePoint-Tag-Kategorie → EAA-Building-Block. */
const OP_CATEGORY_TO_BLOCK: Record<string, BuildingBlock> = {
  'Web Analytics': 'Analytics',
  'Digital Measurement & Attribution': 'Analytics',
  'Heatmap & Recording': 'Analytics',
  'Tag Management': 'Tag Management',
  'A/B Testing & Optimization': 'Personalization & Optimization',
  Personalization: 'Personalization & Optimization',
  'Marketing Automation & Email': 'Campaign Orchestration',
  CRM: 'Campaign Orchestration',
  'Customer Data Platform (CDP)': 'CDP',
  'Data Management (DMP)': 'DMP',
  'Advertising & Paid Media': 'Advertising',
  Retargeting: 'Advertising',
  'Affiliate & Partner': 'Advertising',
  'Privacy & Consent': 'Consent Management',
  'Customer Support & Chat': 'Customer Support',
  Ecommerce: 'E-Commerce',
  'Content & Asset Management': 'CMS',
};

export function buildingBlockForOpCategory(category: string): BuildingBlock | undefined {
  return OP_CATEGORY_TO_BLOCK[category];
}

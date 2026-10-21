import type { AnalysisResult } from '../types/analysis';

/**
 * Indikatives Lizenz-Sizing je Adobe-Produkt auf Basis der gemessenen Website-Daten.
 * Metriken und Definitionen folgen den offiziellen Product Descriptions (helpx.adobe.com/legal/product-descriptions).
 * Kein Angebot: Schätzung mit Spanne, alle Annahmen im UI änderbar.
 */

const PD = 'https://helpx.adobe.com/legal/product-descriptions';

export type SizingKey = 'analytics' | 'target' | 'aemSites' | 'cja' | 'rtcdp' | 'ajo' | 'collection' | 'marketo' | 'commerce';
export type Confidence = 'high' | 'medium' | 'low';

export interface SizingAssumptions {
  /** Basis (gemessen, überschreibbar) */
  monthlyVisits: number;
  pagesPerVisit: number;
  monthlyUniqueVisitors: number;
  /** Zusätzliche Seitenaufrufe aus Apps in % der Web-Page-Views. */
  appTrafficPct: number;
  /** Tracking-Events (Klicks, Downloads, Custom Links) je Page View. */
  eventsPerPageView: number;
  /** Anteil doppelt getaggter Calls (Multi-Suite / VISTA) in %. */
  secondaryCallsPct: number;
  /** Anteil der Page Views, auf denen Target läuft, in %. */
  targetScopePct: number;
  /** Headless-/JSON-API-Calls je Page View (5 API Calls = 1 Content Request). */
  apiCallsPerPageView: number;
  /** Zusätzliche CJA-Rows aus anderen Kanälen (CRM, Call Center, App, POS) in % der Web-Events. */
  otherChannelRowsPct: number;
  /** Bekannte Kunden / CRM-Datensätze. */
  knownCustomers: number;
  /** Monate, die pseudonyme Profile vorgehalten werden (Pseudonymous Profile Data Expiry). */
  anonymousRetentionMonths: number;
  /** Anteil bekannter Kunden, die AJO in 12 Monaten anspricht, in %. */
  engagedPct: number;
  /** E-Mail-/Push-Messages je Engageable Profile und Jahr. */
  messagesPerProfile: number;
  /** Ziele, an die Event Forwarding jedes Event weiterleitet. */
  forwardingDestinations: number;
  /** B2B: Anteil der jährlichen Unique Visitors, die als Contact in Marketo landen, in %. */
  leadCapturePct: number;
  /** Commerce: Conversion Rate je Visit in %. */
  conversionRatePct: number;
  /** Commerce: durchschnittlicher Warenkorb in EUR. */
  averageOrderValue: number;
}

export interface SizingBasis {
  source: 'semrush' | 'manual';
  displayDate?: string;
  measured: Partial<Pick<SizingAssumptions, 'monthlyVisits' | 'pagesPerVisit' | 'monthlyUniqueVisitors'>>;
  mobileApps: number;
}

export interface SizingEstimate {
  key: SizingKey;
  product: string;
  metric: string;
  unit: string;
  low: number;
  mid: number;
  high: number;
  /** Lizenzeinheit laut Product Description, z. B. „per 1,000 Person Profiles“. */
  licenseUnit: string;
  /** Anzahl Lizenzeinheiten (mid), falls die Einheit gebündelt ist. */
  licenseUnits?: number;
  formula: string;
  notes: string[];
  confidence: Confidence;
  assumptionKeys: Array<keyof SizingAssumptions>;
  /** Heute erkannte Technologie in der Kategorie (Adobe oder Wettbewerb). */
  detected: string[];
  adobeInUse: boolean;
  sourceUrl: string;
}

/** Monatliche → jährliche Unique Visitors (Deduplizierung über 12 Monate). */
const ANNUAL_UNIQUE_FACTOR = 4;
const SPREAD: Record<Confidence, [number, number]> = { high: [0.75, 1.3], medium: [0.6, 1.5], low: [0.4, 2] };

export const ASSUMPTION_META: Record<keyof SizingAssumptions, { label: string; unit?: string; step: number }> = {
  monthlyVisits: { label: 'Monthly visits', step: 10_000 },
  pagesPerVisit: { label: 'Pages per visit', step: 0.1 },
  monthlyUniqueVisitors: { label: 'Monthly unique visitors', step: 10_000 },
  appTrafficPct: { label: 'App traffic on top of web', unit: '%', step: 5 },
  eventsPerPageView: { label: 'Tracked events per page view', step: 0.1 },
  secondaryCallsPct: { label: 'Multi-suite tagging (secondary calls)', unit: '%', step: 5 },
  targetScopePct: { label: 'Page views with Target', unit: '%', step: 5 },
  apiCallsPerPageView: { label: 'Headless API calls per page view', step: 0.5 },
  otherChannelRowsPct: { label: 'Other channels (CRM, call center, app, POS)', unit: '%', step: 5 },
  knownCustomers: { label: 'Known customers / CRM records', step: 10_000 },
  anonymousRetentionMonths: { label: 'Pseudonymous profile retention', unit: 'months', step: 1 },
  engagedPct: { label: 'Customers engaged per year', unit: '%', step: 5 },
  messagesPerProfile: { label: 'Messages per profile per year', step: 6 },
  forwardingDestinations: { label: 'Event forwarding destinations', step: 1 },
  leadCapturePct: { label: 'Visitors captured as contacts', unit: '%', step: 0.5 },
  conversionRatePct: { label: 'Conversion rate per visit', unit: '%', step: 0.1 },
  averageOrderValue: { label: 'Average order value', unit: 'EUR', step: 5 },
};

export function sizingBasis(analysis: AnalysisResult): SizingBasis {
  const s = analysis.enrichments?.traffic?.semrush;
  const visits = s?.visits ?? (s?.source === 'seo' ? s.organicTraffic : undefined);
  return {
    source: visits ? 'semrush' : 'manual',
    displayDate: s?.displayDate,
    measured: {
      monthlyVisits: visits || undefined,
      pagesPerVisit: s?.pagesPerVisit || undefined,
      monthlyUniqueVisitors: s?.uniqueVisitors || undefined,
    },
    mobileApps: analysis.enrichments?.mobileApps?.apps.length ?? 0,
  };
}

export function defaultAssumptions(basis: SizingBasis): SizingAssumptions {
  const monthlyVisits = Math.round(basis.measured.monthlyVisits ?? 0);
  const monthlyUniqueVisitors = Math.round(basis.measured.monthlyUniqueVisitors ?? monthlyVisits * 0.6);
  return {
    monthlyVisits,
    pagesPerVisit: round1(basis.measured.pagesPerVisit ?? 3),
    monthlyUniqueVisitors,
    appTrafficPct: basis.mobileApps > 0 ? 30 : 0,
    eventsPerPageView: 0.5,
    secondaryCallsPct: 0,
    targetScopePct: 100,
    apiCallsPerPageView: 0,
    otherChannelRowsPct: 20,
    knownCustomers: roundTo(monthlyUniqueVisitors * ANNUAL_UNIQUE_FACTOR * 0.3, 1000),
    anonymousRetentionMonths: 1,
    engagedPct: 60,
    messagesPerProfile: 24,
    forwardingDestinations: 2,
    leadCapturePct: 2,
    conversionRatePct: 1.5,
    averageOrderValue: 80,
  };
}

const CATEGORY_HINTS: Record<SizingKey, { categories: string[]; adobe: RegExp }> = {
  analytics: { categories: ['Analytics'], adobe: /adobe analytics|appmeasurement/i },
  target: { categories: ['Personalization & Optimization', 'CRO'], adobe: /adobe target|at\.js/i },
  aemSites: { categories: ['CMS'], adobe: /experience manager|\baem\b|edge delivery/i },
  cja: { categories: ['Analytics'], adobe: /customer journey analytics/i },
  rtcdp: { categories: ['CDP', 'DMP'], adobe: /real-time cdp|rtcdp|audience manager/i },
  ajo: { categories: ['ESP/Marketing Automation', 'Push Notifications'], adobe: /journey optimizer|adobe campaign/i },
  collection: { categories: ['Tag Management'], adobe: /experience platform (tags|launch|data collection)|adobe launch|adobe dtm/i },
  marketo: { categories: ['ESP/Marketing Automation', 'CRM'], adobe: /marketo/i },
  commerce: { categories: ['eCommerce'], adobe: /adobe commerce|magento/i },
};

function detectedFor(key: SizingKey, analysis: AnalysisResult): { detected: string[]; adobeInUse: boolean } {
  const hint = CATEGORY_HINTS[key];
  const hits = analysis.rawDetections.filter(
    (d) => !d.weak && (d.categories.some((c) => hint.categories.includes(c)) || hint.adobe.test(d.name)),
  );
  const names = [...new Set(hits.map((d) => d.name))];
  return { detected: names.slice(0, 4), adobeInUse: names.some((n) => hint.adobe.test(n)) };
}

function range(mid: number, confidence: Confidence): Pick<SizingEstimate, 'low' | 'mid' | 'high' | 'confidence'> {
  const [lo, hi] = SPREAD[confidence];
  return { low: Math.round(mid * lo), mid: Math.round(mid), high: Math.round(mid * hi), confidence };
}

export function pageViewsPerMonth(a: SizingAssumptions): number {
  return a.monthlyVisits * a.pagesPerVisit * (1 + a.appTrafficPct / 100);
}

export function estimateLicenses(analysis: AnalysisResult, a: SizingAssumptions): SizingEstimate[] {
  const pv = pageViewsPerMonth(a);
  const primaryCallsYear = pv * (1 + a.eventsPerPageView) * 12;
  const annualUniques = a.monthlyUniqueVisitors * ANNUAL_UNIQUE_FACTOR;
  const pseudonymous = a.monthlyUniqueVisitors * a.anonymousRetentionMonths;
  const profiles = a.knownCustomers + pseudonymous;
  const engageable = a.knownCustomers * (a.engagedPct / 100);
  const make = (key: SizingKey, e: Omit<SizingEstimate, 'key' | 'detected' | 'adobeInUse'>): SizingEstimate => ({
    key,
    ...e,
    ...detectedFor(key, analysis),
  });

  const ajoMessages = engageable * a.messagesPerProfile;
  return [
    make('analytics', {
      product: 'Adobe Analytics',
      metric: 'Server calls per year',
      unit: 'server calls / year',
      ...range(primaryCallsYear * (1 + a.secondaryCallsPct / 100), 'high'),
      licenseUnit: 'Primary and/or Secondary Server Calls',
      formula: 'Page views × (1 + events per page view) × 12, plus secondary calls for multi-suite tagging',
      notes: [
        `Primary ≈ ${compact(primaryCallsYear)}, secondary ≈ ${compact(primaryCallsYear * (a.secondaryCallsPct / 100))}`,
        'Each tagged page view, exit link, download or custom link counts as one Primary Server Call.',
      ],
      assumptionKeys: ['eventsPerPageView', 'secondaryCallsPct', 'appTrafficPct'],
      sourceUrl: `${PD}/adobe-analytics.html`,
    }),
    make('cja', {
      product: 'Customer Journey Analytics',
      metric: 'Rows of Data',
      unit: 'rows (daily average, 13 months)',
      ...range(primaryCallsYear * (13 / 12) * (1 + a.otherChannelRowsPct / 100), 'medium'),
      licenseUnit: 'per Million Rows of Data',
      licenseUnits: Math.ceil((primaryCallsYear * (13 / 12) * (1 + a.otherChannelRowsPct / 100)) / 1e6),
      formula: 'Web events per year × 13/12 (Core Data window) × (1 + other channels)',
      notes: ['Rows of Data = total daily average rows available for analysis; Core Data covers 13 months.'],
      assumptionKeys: ['eventsPerPageView', 'otherChannelRowsPct'],
      sourceUrl: `${PD}/customer-journey-analytics.html`,
    }),
    make('target', {
      product: 'Adobe Target',
      metric: 'Annual Page View Traffic',
      unit: 'page views / year',
      ...range(pv * 12 * (a.targetScopePct / 100), 'high'),
      licenseUnit: 'Annual Page View Traffic',
      formula: 'Page views per month × 12 × share of pages running Target',
      notes: ['Annual Page View Traffic = sum of page views (incl. app screen views) during 12 months.'],
      assumptionKeys: ['targetScopePct', 'appTrafficPct'],
      sourceUrl: `${PD}/adobe-target.html`,
    }),
    make('aemSites', {
      product: 'AEM Sites as a Cloud Service',
      metric: 'Content Requests per month',
      unit: 'content requests / month',
      ...range(a.monthlyVisits * a.pagesPerVisit + (pv * a.apiCallsPerPageView) / 5, 'high'),
      licenseUnit: 'Content Requests per month',
      formula: 'Web page views + headless API calls ÷ 5',
      notes: ['A Content Request is one page view or five API calls, measured at the first caching layer.'],
      assumptionKeys: ['apiCallsPerPageView'],
      sourceUrl: `${PD}/aem-cloud-service.html`,
    }),
    make('rtcdp', {
      product: 'Real-Time CDP (B2C)',
      metric: 'Person Profiles',
      unit: 'person profiles',
      ...range(profiles, 'low'),
      licenseUnit: 'per 1,000 Person Profiles',
      licenseUnits: Math.ceil(profiles / 1000),
      formula: 'Known customers + monthly unique visitors × pseudonymous retention (months)',
      notes: [
        'Person Profiles include directly identifiable and pseudonymous profiles.',
        `Total Data Volume entitlement: 75 KB × licensed profiles ≈ ${compact((profiles * 75) / 1e6)} GB.`,
      ],
      assumptionKeys: ['knownCustomers', 'anonymousRetentionMonths'],
      sourceUrl: `${PD}/real-time-customer-data-platform-b2c-edition-prime-and-ultimate-packages.html`,
    }),
    make('ajo', {
      product: 'Journey Optimizer',
      metric: 'Engageable Profiles',
      unit: 'engageable profiles',
      ...range(engageable, 'low'),
      licenseUnit: 'per 1,000 Engageable Profiles',
      licenseUnits: Math.ceil(engageable / 1000),
      formula: 'Known customers × share engaged within 12 months',
      notes: [
        `Message volume ≈ ${compact(ajoMessages)} / year (${a.messagesPerProfile} per profile; entitlement averages up to 60).`,
        `Addressable Audience allowed: 125% ≈ ${compact(engageable * 1.25)} profiles.`,
      ],
      assumptionKeys: ['knownCustomers', 'engagedPct', 'messagesPerProfile'],
      sourceUrl: `${PD}/adobe-journey-optimizer-select-prime-ultimate.html`,
    }),
    make('collection', {
      product: 'AEP Collection Enterprise',
      metric: 'Outgoing Calls (Event Forwarding)',
      unit: 'outgoing calls / year',
      ...range(primaryCallsYear * a.forwardingDestinations, 'medium'),
      licenseUnit: 'per Million Outgoing Calls',
      licenseUnits: Math.ceil((primaryCallsYear * a.forwardingDestinations) / 1e6),
      formula: 'Web events per year × event forwarding destinations',
      notes: ['Only needed for server-side event forwarding to non-Adobe endpoints.'],
      assumptionKeys: ['forwardingDestinations', 'eventsPerPageView'],
      sourceUrl: `${PD}/adobe-experience-platform-collection-enterprise.html`,
    }),
    make('marketo', {
      product: 'Marketo Engage (B2B)',
      metric: 'Contacts',
      unit: 'contacts',
      ...range(annualUniques * (a.leadCapturePct / 100), 'low'),
      licenseUnit: 'per 1,000 Contacts',
      licenseUnits: Math.ceil((annualUniques * (a.leadCapturePct / 100)) / 1000),
      formula: 'Annual unique visitors (≈ 4 × monthly) × share captured as contacts',
      notes: ['Relevant for B2B lead management; replace with the real database size when known.'],
      assumptionKeys: ['leadCapturePct'],
      sourceUrl: `${PD}/adobe-marketo-engage---product-description.html`,
    }),
    make('commerce', {
      product: 'Adobe Commerce as a Cloud Service',
      metric: 'Gross Merchandise Value',
      unit: 'EUR GMV / year',
      ...range(a.monthlyVisits * 12 * (a.conversionRatePct / 100) * a.averageOrderValue, 'low'),
      licenseUnit: 'Base package by GMV / order tier',
      formula: 'Visits × 12 × conversion rate × average order value',
      notes: ['Only relevant if the site sells online; GMV excludes shipping, taxes and financing.'],
      assumptionKeys: ['conversionRatePct', 'averageOrderValue'],
      sourceUrl: `${PD}/adobe-commerce-cloud-service.html`,
    }),
  ];
}

export function compact(n: number): string {
  if (!Number.isFinite(n)) return '–';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${trim(n / 1e9)}B`;
  if (abs >= 1e6) return `${trim(n / 1e6)}M`;
  if (abs >= 1e3) return `${trim(n / 1e3)}K`;
  return `${Math.round(n)}`;
}

function trim(v: number): string {
  return v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(2).replace(/\.?0+$/, '');
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function roundTo(v: number, step: number): number {
  return Math.round(v / step) * step;
}

import { customDetect, type DetectedTech } from './customDetectors.js';
import type { ScrapedData } from './scraper.js';

/**
 * Consent-Audit: Welche Tracking-Technologien sind aktiv, BEVOR der Cookie-Banner
 * akzeptiert wurde? Der Worker sichert dafür Requests und Cookie-Namen unmittelbar
 * vor dem Accept-Klick. Nur aussagekräftig, wenn tatsächlich ein Banner geklickt wurde.
 */
export interface ConsentSnapshot {
  bannerAccepted: boolean;
  preConsentRequests: string[];
  preConsentCookies: string[];
}

/** Kategorien, die typischerweise eine Einwilligung (TTDSG/DSGVO) erfordern. */
const CONSENT_REQUIRED = new Set([
  'Analytics',
  'Advertising',
  'Personalization & Optimization',
  'CDP',
  'DMP',
  'ESP/Marketing Automation',
  'Social',
  'CRO',
]);

export const PRE_CONSENT_WARNING = '⚠ Active before consent (request/cookie seen before the cookie banner was accepted)';

export function preConsentDetections(consent: ConsentSnapshot | undefined, finalUrl: string): DetectedTech[] {
  if (!consent?.bannerAccepted) return [];
  const snapshot: ScrapedData = {
    url: finalUrl,
    finalUrl,
    html: '',
    headers: {},
    meta: {},
    scriptSrc: [],
    cookies: Object.fromEntries(consent.preConsentCookies.map((name) => [name, ''])),
    title: '',
    bodyText: '',
    links: [],
    requests: consent.preConsentRequests,
    jsGlobals: {},
    edgeSignals: [],
  };
  return customDetect(snapshot).filter(
    (d) => !d.weak && d.categories.some((c) => CONSENT_REQUIRED.has(c)),
  );
}

/** Markiert erkannte Technologien, die schon vor dem Consent aktiv waren. Gibt deren Namen zurück. */
export function annotatePreConsent(
  detected: DetectedTech[],
  consent: ConsentSnapshot | undefined,
  finalUrl: string,
): string[] {
  const pre = new Set(preConsentDetections(consent, finalUrl).map((d) => d.name));
  const flagged: string[] = [];
  for (const tech of detected) {
    if (!pre.has(tech.name)) continue;
    tech.evidence = [PRE_CONSENT_WARNING, ...(tech.evidence ?? []).filter((e) => e !== PRE_CONSENT_WARNING)];
    flagged.push(tech.name);
  }
  return flagged;
}

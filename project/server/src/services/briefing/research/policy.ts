/** Recherche-Richtlinien: gesperrte Personen-Aggregatoren, Paywalls, PDFs. */
import { hostOf, hostMatches } from './text.js';

/** Personen-/Kontaktdaten-Aggregatoren – Regel aus research-guide.md + LinkedIn (Login-Pflicht). */
export const AGGREGATOR_DOMAINS = [
  'zoominfo.com',
  'rocketreach.co',
  'apollo.io',
  'lusha.com',
  'signalhire.com',
  'contactout.com',
  'leadiq.com',
  'theorg.com',
  'linkedin.com',
  'craft.co',
  'globaldata.com',
  'bayt.com',
] as const;

/** Bekannte Paywalls: nur Snippet verwenden. */
export const PAYWALL_DOMAINS = ['ft.com', 'bloomberg.com', 'wsj.com', 'handelsblatt.com', 'economist.com', 'barrons.com'] as const;

export function blockedDomainReason(url: string): string | null {
  const host = hostOf(url);
  if (!host) return 'invalid URL';
  if (hostMatches(host, AGGREGATOR_DOMAINS)) {
    return `${host} is a people/contact-data aggregator (or login-walled) and must not be used as a source – names from it are not allowed.`;
  }
  return null;
}

export function isPaywalled(url: string): boolean {
  return hostMatches(hostOf(url), PAYWALL_DOMAINS);
}

/**
 * Leitet aus der eingegebenen URL eine passende Locale + Timezone ab, damit der
 * Scraper lokalisierte/Geo-basierte Redirects NICHT auf eine fremde Länderversion
 * laufen lässt (z.B. .de → englische/US-Variante wegen `Accept-Language: en-US`).
 */

interface LocaleInfo {
  acceptLanguage: string;
  timezone: string;
}

/** ccTLD → { Sprache, Timezone }. Zwei-teilige TLDs (co.uk) über die letzte Marke. */
const TLD_LOCALE: Record<string, { lang: string; tz: string }> = {
  de: { lang: 'de-DE', tz: 'Europe/Berlin' },
  at: { lang: 'de-AT', tz: 'Europe/Vienna' },
  ch: { lang: 'de-CH', tz: 'Europe/Zurich' },
  fr: { lang: 'fr-FR', tz: 'Europe/Paris' },
  it: { lang: 'it-IT', tz: 'Europe/Rome' },
  es: { lang: 'es-ES', tz: 'Europe/Madrid' },
  pt: { lang: 'pt-PT', tz: 'Europe/Lisbon' },
  nl: { lang: 'nl-NL', tz: 'Europe/Amsterdam' },
  be: { lang: 'nl-BE', tz: 'Europe/Brussels' },
  pl: { lang: 'pl-PL', tz: 'Europe/Warsaw' },
  cz: { lang: 'cs-CZ', tz: 'Europe/Prague' },
  se: { lang: 'sv-SE', tz: 'Europe/Stockholm' },
  dk: { lang: 'da-DK', tz: 'Europe/Copenhagen' },
  no: { lang: 'nb-NO', tz: 'Europe/Oslo' },
  fi: { lang: 'fi-FI', tz: 'Europe/Helsinki' },
  uk: { lang: 'en-GB', tz: 'Europe/London' },
  ie: { lang: 'en-IE', tz: 'Europe/Dublin' },
  us: { lang: 'en-US', tz: 'America/New_York' },
  ca: { lang: 'en-CA', tz: 'America/Toronto' },
  au: { lang: 'en-AU', tz: 'Australia/Sydney' },
  in: { lang: 'en-IN', tz: 'Asia/Kolkata' },
  jp: { lang: 'ja-JP', tz: 'Asia/Tokyo' },
};

/**
 * Fällt für gTLDs (.com/.net/.org/…) und Unbekanntes hierauf zurück. Per ENV
 * überschreibbar. Default ist en-US: globale gTLD-Seiten sind überwiegend
 * englisch-first, daher ist Englisch die neutralere Sprach-Negotiation als eine
 * länderspezifische Sprache. (Hinweis: verhindert NUR sprachbasierte Redirects –
 * IP-Geo-Redirects globaler Marken lassen sich damit nicht überschreiben.)
 */
const DEFAULT_LANG = process.env.SCRAPE_DEFAULT_LOCALE || 'en-US';
const DEFAULT_TZ = process.env.SCRAPE_DEFAULT_TIMEZONE || 'America/New_York';

export function localeForUrl(rawUrl: string): LocaleInfo {
  let tld = '';
  try {
    const host = new URL(rawUrl).hostname;
    tld = host.split('.').pop()?.toLowerCase() ?? '';
  } catch {
    // ungültige URL → Default
  }

  const entry = TLD_LOCALE[tld];
  const lang = entry?.lang ?? DEFAULT_LANG;
  const tz = entry?.tz ?? DEFAULT_TZ;
  const base = lang.split('-')[0];

  // z.B. "de-DE,de;q=0.9,en;q=0.5" — bevorzugt die lokale Sprache, akzeptiert Englisch nachrangig.
  const acceptLanguage =
    base === 'en'
      ? `${lang},en;q=0.9`
      : `${lang},${base};q=0.9,en;q=0.5`;

  return { acceptLanguage, timezone: tz };
}

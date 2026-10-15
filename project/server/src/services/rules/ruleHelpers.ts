/** Hilfsfunktionen für robuste, verankerte Erkennungs-Patterns (siehe docs/library-research/04-rule-quality.md). */

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * Host-Anker: trifft `domain` nur als ganzen Host oder Host-Suffix (`//x.domain/…`, `.domain:443`),
 * nie als Teilstring eines längeren Hosts (`onshape.com`, `socialimpact.com`, `shop.app.example.com`).
 */
export function host(domain: string): RegExp {
  return new RegExp(`(^|//|\\.)${escapeRe(domain)}(?=[/:"'?#\\s]|$)`);
}

/**
 * Produktwort nur im `src`/`href`-Kontext (Asset-/Skript-Pfade) statt irgendwo im Fließtext.
 * Ein Link auf die Hersteller-Homepage (`https://www.<wort>.…`) zählt nicht als Implementierungsbeleg.
 */
export function asset(word: string): RegExp {
  const w = escapeRe(word);
  return new RegExp(`(src|href)=["'](?!https?://(www\\.)?${w}\\.)[^"']*${w}`, 'i');
}

/**
 * Robuste JSON-Verarbeitung für LLM-Antworten.
 *
 * LLM-Antworten sind nicht garantiert wohlgeformt: Modelle wickeln JSON gelegentlich
 * in Code-Fences, hängen Erklärtext an oder – bei Erreichen von max_tokens – schneiden
 * die Antwort mitten in einem String ab. Diese Helfer machen das Parsen widerstandsfähig
 * gegen genau diese Fälle.
 */

/**
 * Extrahiert das äußerste, balancierte JSON-Objekt aus einem rohen LLM-Text.
 * Strippt vorhandene Code-Fences und ignoriert alles vor der ersten `{` bzw. nach der
 * zugehörigen schließenden `}`. Strings und Escapes werden korrekt übersprungen.
 */
export function extractJsonObject(raw: string): string {
  let s = raw.trim();

  // Code-Fences entfernen, falls das Modell sie trotz Anweisung eingefügt hat.
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    s = fenceMatch[1].trim();
  }

  const start = s.indexOf('{');
  if (start === -1) return s;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        // Vollständiges Objekt gefunden.
        return s.slice(start, i + 1);
      }
    }
  }

  // Kein balanciertes Ende gefunden (abgeschnitten) – Rest ab erster `{` zurückgeben,
  // damit repairTruncatedJson daran arbeiten kann.
  return s.slice(start);
}

/**
 * Repariert abgeschnittenes JSON: schließt einen offenen String, entfernt einen
 * dann noch dangling stehenden Key/Komma und schließt offene `[`/`{` in korrekter
 * Reihenfolge. Best-Effort – liefert einen Kandidaten, der geparst werden kann.
 */
export function repairTruncatedJson(input: string): string {
  let s = input.trim();

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }

  // Offenen String schließen.
  if (inString) {
    s += '"';
  }

  // Ein dangling Escape am Ende hinterlässt ungültiges JSON – wegnehmen.
  if (/\\$/.test(s)) {
    s = s.slice(0, -1);
  }

  // Trailing-Reste entfernen: hängendes Komma oder ein abgebrochener Key/Wert
  // (z.B. `"summary": ` ohne Wert oder `"foo",`).
  s = s.replace(/,\s*$/, '');
  s = s.replace(/"[^"]*"\s*:\s*$/, '');
  s = s.replace(/,\s*$/, '');

  // Offene Klammern in umgekehrter Reihenfolge schließen.
  for (let i = stack.length - 1; i >= 0; i--) {
    s += stack[i] === '{' ? '}' : ']';
  }

  return s;
}

/**
 * Parst eine rohe LLM-Antwort robust zu einem Objekt.
 * 1) Objekt extrahieren + `JSON.parse`.
 * 2) Bei SyntaxError: reparieren (abgeschnittenes JSON) + erneut parsen.
 * Wirft nur, wenn auch die Reparatur kein valides JSON ergibt.
 */
export function parseAIJson<T>(raw: string): T {
  const extracted = extractJsonObject(raw);
  try {
    return JSON.parse(extracted) as T;
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    const repaired = repairTruncatedJson(extracted);
    return JSON.parse(repaired) as T;
  }
}

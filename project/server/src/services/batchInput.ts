/**
 * Reine Parser/Validatoren für Account- und Bulk-Assessments (EAA "Web Assessment" / "Bulk Assessment").
 * Keine I/O – DNS-Prüfung passiert erst beim Scrapen (scrapePage → sanitizeUrlWithDns).
 */
import { sanitizeUrl } from '../utils/sanitize.js';

export const MAX_BULK_URLS = 1000;
export const MAX_ACCOUNT_URLS = 30;
const MAX_LABEL_LENGTH = 255;
const MAX_URL_LENGTH = 2048;

export interface BatchInputItem {
  url: string;
  label?: string;
}

export interface BatchInputResult {
  items: BatchInputItem[];
  errors: string[];
}

interface RawRow {
  url: string;
  label?: string;
  line: number;
}

/** EAA-Regel (`/^\w+/`), Unicode-tolerant, damit auch "Österreich" gültig ist. */
const LABEL_START = /^[\p{L}\p{N}_]/u;
const HEADER_URL = new Set(['url', 'urls', 'website', 'websites', 'domain', 'site', 'link']);
const HEADER_LABEL = new Set(['label', 'title', 'brand', 'name', 'country', 'geo', 'stage', 'competitor']);

/** Normalisiert eine URL (https:// ergänzen, private/ungültige Hosts ablehnen). */
export function normalizeBatchUrl(input: string): string | null {
  const raw = input.trim().replace(/^["']|["']$/g, '');
  if (!raw || raw.length > MAX_URL_LENGTH || /\s/.test(raw)) return null;
  const sanitized = sanitizeUrl(raw);
  if (!sanitized) return null;
  try {
    const u = new URL(sanitized);
    if (!u.hostname.includes('.')) return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

function dedupeKey(url: string): string {
  const u = new URL(url);
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '');
  return `${host}${path}${u.search}`;
}

function splitCells(line: string): string[] {
  const delimiter = line.includes('\t') ? '\t' : line.includes(';') && !line.includes(',') ? ';' : ',';
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Validiert/normalisiert Items (aus Parser oder JSON-Body), entfernt Duplikate, kappt bei `maxItems`. */
export function normalizeBatchItems(
  rows: Array<{ url: string; label?: string; line?: number }>,
  maxItems: number = MAX_BULK_URLS,
): BatchInputResult {
  const items: BatchInputItem[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  rows.forEach((row, idx) => {
    const where = `Line ${row.line ?? idx + 1}`;
    const url = normalizeBatchUrl(row.url ?? '');
    if (!url) {
      errors.push(`${where}: invalid or disallowed URL "${(row.url ?? '').slice(0, 120)}"`);
      return;
    }
    const label = row.label?.trim() || undefined;
    if (label !== undefined) {
      if (!LABEL_START.test(label)) {
        errors.push(`${where}: label "${label.slice(0, 60)}" must start with a letter, digit or underscore`);
        return;
      }
      if (label.length > MAX_LABEL_LENGTH) {
        errors.push(`${where}: label is longer than ${MAX_LABEL_LENGTH} characters`);
        return;
      }
    }
    const key = dedupeKey(url);
    if (seen.has(key)) return;
    seen.add(key);
    if (items.length >= maxItems) {
      dropped++;
      return;
    }
    items.push(label ? { url, label } : { url });
  });

  if (dropped > 0) {
    errors.push(`Too many URLs: maximum is ${maxItems}, ${dropped} additional URL(s) were ignored`);
  }
  return { items, errors };
}

/**
 * Akzeptiert CSV mit Header (`url[,label|title|brand]`) oder freie Zeilen
 * `url`, `url, label`, `url<TAB>label`. Leere Zeilen und `#`-Kommentare werden übersprungen.
 */
export function parseBatchInput(text: string, maxItems: number = MAX_BULK_URLS): BatchInputResult {
  const lines = (text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const rows: RawRow[] = [];
  let urlCol = 0;
  let labelCol = 1;
  let headerChecked = false;

  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const cells = splitCells(line);

    if (!headerChecked) {
      headerChecked = true;
      const lower = cells.map((c) => c.toLowerCase().replace(/^["']|["']$/g, ''));
      const u = lower.findIndex((c) => HEADER_URL.has(c));
      if (u >= 0) {
        urlCol = u;
        const l = lower.findIndex((c, idx) => idx !== u && HEADER_LABEL.has(c));
        labelCol = l;
        return;
      }
    }

    const url = cells[urlCol] ?? '';
    const label = labelCol >= 0 ? cells[labelCol] : undefined;
    if (!url && !label) return;
    rows.push({ url, label: label || undefined, line: i + 1 });
  });

  return normalizeBatchItems(rows, maxItems);
}

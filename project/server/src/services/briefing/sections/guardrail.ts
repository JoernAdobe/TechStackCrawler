/**
 * Quellen-Guardrail (im Code erzwungen): nur tatsächlich abgerufene bzw. in Suchergebnissen
 * gesehene URLs, Unabhängigkeit aus den Client-Domains, Datum aus der Seite, 2–5 Quellen,
 * höchstens die Hälfte kundeneigen; sonst Status „thin“ mit Lücke.
 */
import type { BriefingSection, BriefingSectionId, BriefingSource } from '../../../types/briefing.js';
import type { SourceLedger } from '../research/ledger.js';
import { blockedDomainReason } from '../research/policy.js';
import { MON_YEAR_RE, isClientOwned, normalizeUrl } from '../research/text.js';
import { toPlainText } from './normalize.js';

export const MIN_SOURCES = 2;
export const MAX_SOURCES = 5;

export interface GuardrailContext {
  sectionId: BriefingSectionId;
  ledger: SourceLedger;
  clientDomains: string[];
  clientKey: string;
  /** TechStack-Analyzer-Scan als Quelle (nur in Abschnitten mit Scan-Fakten). */
  scanSource?: BriefingSource;
  now?: Date;
}

interface Candidate {
  source: BriefingSource;
  /** Wie der Report-Validator zählt: Host gehört dem Kunden (gilt auch für die Scan-Quelle). */
  ownedHost: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isFuture(monYear: string, now: Date): boolean {
  const [m, y] = monYear.split(' ');
  return Number(y) * 12 + MONTHS.indexOf(m) > now.getUTCFullYear() * 12 + now.getUTCMonth();
}

function pickDate(entryDate: string | null, claimed: string, pageText: string | undefined, now: Date): string {
  if (entryDate && MON_YEAR_RE.test(entryDate) && !isFuture(entryDate, now)) return entryDate;
  // Vom Modell genanntes Datum nur, wenn das Jahr im abgerufenen Text vorkommt.
  if (MON_YEAR_RE.test(claimed) && !isFuture(claimed, now) && pageText?.includes(claimed.slice(-4))) return claimed;
  // Undatierte Seite: Abrufdatum ehrlich als „accessed“ kennzeichnen (Validator verlangt Mon YYYY).
  return `accessed ${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
}

export interface ResolvedSources {
  sources: BriefingSource[];
  dropped: string[];
  independentCount: number;
}

export function resolveSources(raw: unknown, ctx: GuardrailContext): ResolvedSources {
  const now = ctx.now ?? new Date();
  const list = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
  const seen = new Set<string>();
  const dropped: string[] = [];
  const candidates: Candidate[] = [];
  const scanKey = ctx.scanSource ? normalizeUrl(ctx.scanSource.url) : null;

  for (const r of list) {
    const url = typeof r?.url === 'string' ? r.url.trim() : '';
    const key = normalizeUrl(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const claimedTitle = toPlainText(r.title);
    if (ctx.scanSource && (key === scanKey || /techstack analyzer/i.test(claimedTitle))) {
      if (!candidates.some((c) => c.source === ctx.scanSource)) candidates.push({ source: ctx.scanSource, ownedHost: true });
      continue;
    }
    if (blockedDomainReason(url)) {
      dropped.push(`${url} (people-data aggregator)`);
      continue;
    }
    const entry = ctx.ledger.get(url);
    if (!entry) {
      dropped.push(`${url} (not fetched or seen in search results)`);
      continue;
    }
    const owned = isClientOwned(entry.url, ctx.clientDomains, ctx.clientKey);
    const title = (entry.kind !== 'search' && entry.title) || claimedTitle || entry.title;
    candidates.push({
      ownedHost: owned,
      source: {
        title: title.slice(0, 200),
        url: entry.url,
        publisher: entry.publisher,
        date: pickDate(entry.date, toPlainText(r.date), entry.text, now),
        independent: !owned,
        ...(entry.kind === 'search' || entry.paywalled ? { snippetOnly: true } : {}),
      },
    });
  }

  // Unabhängige zuerst; kundeneigene Hosts höchstens zur Hälfte (Report-Validator-Regel).
  const independent = candidates.filter((c) => !c.ownedHost).slice(0, MAX_SOURCES);
  const owned = candidates.filter((c) => c.ownedHost);
  const chosen = [...independent];
  let ownedCount = 0;
  for (const c of owned) {
    if (chosen.length >= MAX_SOURCES) break;
    // Ohne unabhängige Quelle bleiben die kundeneigenen erhalten (Abschnitt wird dann „thin“).
    if (independent.length && (ownedCount + 1) * 2 > chosen.length + 1) break;
    chosen.push(c);
    ownedCount++;
  }
  for (const c of candidates) if (!chosen.includes(c)) dropped.push(`${c.source.url} (limit / client-owned share)`);
  return { sources: chosen.map((c) => c.source), dropped, independentCount: independent.length };
}

export interface FinalizeInput {
  blocks: BriefingSection['blocks'];
  gaps: string[];
  resolved: ResolvedSources;
}

/** Status-Regeln: < 2 Quellen oder keine unabhängige → thin + Lücke; s12 ohne gültige Quelle → keine Namen. */
export function finalizeSection(id: BriefingSectionId, title: string, eyebrow: string, input: FinalizeInput): BriefingSection {
  const gaps = [...input.gaps];
  let blocks = input.blocks;
  const { sources, independentCount } = input.resolved;
  let status: BriefingSection['status'] = 'done';
  if (sources.length < MIN_SOURCES) {
    status = 'thin';
    gaps.push(`Fewer than ${MIN_SOURCES} verifiable sources were found for this section (${sources.length}); findings need confirmation.`);
  } else if (independentCount === 0) {
    status = 'thin';
    gaps.push('No independent (non-client) source could be verified for this section.');
  }
  if (id === 's12' && sources.length === 0 && blocks.length) {
    blocks = [{ type: 'note', title: 'Stakeholders not verified', text: 'No named stakeholders are listed because no verifiable public source could be confirmed.' }];
  }
  if (!blocks.length) {
    status = 'thin';
    blocks = [{ type: 'paragraph', text: 'Insufficient verified public information was found for this section.' }];
  }
  return { id, title, eyebrow, status, blocks, sources, gaps: [...new Set(gaps)] };
}

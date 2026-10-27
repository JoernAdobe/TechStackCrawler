/**
 * Normalisierte Nutzungs-Events für Digest Studio („saved man-hours“).
 * Quellen: usage_events (Analyse, Use Cases, Exporte), briefing_jobs (fertige
 * Pre-Briefings) und batch_items (fertige Assessment-Items). Admin- und
 * System-Besucher werden wie in usageStats.ts ausgeschlossen; mcp_call und
 * rfp_context werden bewusst nicht ausgegeben (keine Doppelzählung).
 */
import { createHash } from 'crypto';
import type { DbHandle } from '../db/types.js';
import { toMysqlDatetime } from '../db/analyses.js';
import { SYSTEM_VISITORS } from './usageTracking.js';
import { toMs } from './usageStats.js';

export const SAVINGS_EVENTS_LIMIT = 50_000;

export const EXPORT_EVENTS = [
  'export_pdf', 'export_briefing_pdf', 'export_briefing_html', 'export_deck', 'export_batch', 'export_markdown', 'export_excel',
] as const;

const USAGE_CAPABILITIES: Record<string, string> = {
  analysis: 'tech_stack_analysis',
  use_cases: 'use_case_discovery',
  ...Object.fromEntries(EXPORT_EVENTS.map((e) => [e, 'export'])),
};

export interface SavingsEvent {
  external_id: string;
  capability: string;
  occurred_at: string;
  user_hash: string;
  units: number;
  dedupe_key: string;
  meta: Record<string, string | number | boolean>;
}

export interface SavingsEventsOptions {
  sinceMs: number;
  untilMs: number;
  adminEmails?: string[];
  limit?: number;
}

export function hashId(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 16);
}

function isEmail(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.includes('@');
}

function userHash(email: string | null | undefined, visitorId?: string | null): string {
  if (isEmail(email)) return hashId(email);
  if (visitorId) return `v:${hashId(visitorId)}`;
  return '';
}

function isoOf(v: unknown): string | null {
  const ms = toMs(v);
  return ms == null ? null : new Date(ms).toISOString();
}

async function rows<T>(db: DbHandle, sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    const { rows: r } = await db.execute(sql, params);
    return r as T[];
  } catch {
    return []; // Tabelle fehlt (ältere DB) → Quelle liefert nichts
  }
}

interface UsageRow { id: number; ts_ms: number; visitor_id: string; email: string | null; event: string; analysis_id: number | null }
interface BriefingRow { id: number; analysis_id: number; batch_id: number | null; created_by: string | null; finished_at: unknown }
interface ItemRow { id: number; batch_id: number; analysis_id: number | null; finished_at: unknown; created_by: string | null; kind: string | null }

export async function collectSavingsEvents(db: DbHandle, opts: SavingsEventsOptions): Promise<SavingsEvent[]> {
  const limit = Math.min(opts.limit ?? SAVINGS_EVENTS_LIMIT, SAVINGS_EVENTS_LIMIT);
  const admins = [...new Set((opts.adminEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const isAdmin = (email: string | null | undefined) => !!email && admins.includes(email.trim().toLowerCase());
  const dt = (ms: number) => {
    const iso = new Date(ms).toISOString();
    return db.dialect === 'mysql' ? toMysqlDatetime(iso) : iso;
  };
  const events: SavingsEvent[] = [];

  // usage_events: Analysen, Use Cases, Exporte
  const usageNames = Object.keys(USAGE_CAPABILITIES);
  const usage = await rows<UsageRow>(
    db,
    `SELECT id, ts_ms, visitor_id, email, event, analysis_id FROM usage_events
     WHERE ts_ms >= ? AND ts_ms < ? AND status < 400 AND event IN (${usageNames.map(() => '?').join(', ')})
     ORDER BY ts_ms ASC LIMIT ${limit}`,
    [opts.sinceMs, opts.untilMs, ...usageNames],
  );
  // Wie usageStats: ein Besucher, der je mit Admin-E-Mail aufgetreten ist, zählt komplett als Admin.
  const adminVisitors = new Set(
    admins.length
      ? (await rows<{ visitor_id: string }>(
          db,
          `SELECT DISTINCT visitor_id FROM usage_events WHERE LOWER(email) IN (${admins.map(() => '?').join(', ')})`,
          admins,
        )).map((r) => r.visitor_id)
      : [],
  );
  for (const r of usage) {
    if (SYSTEM_VISITORS.has(r.visitor_id) || adminVisitors.has(r.visitor_id) || isAdmin(r.email)) continue;
    const capability = USAGE_CAPABILITIES[r.event];
    const externalId = `ue:${r.id}`;
    const analysisId = r.analysis_id == null ? null : Number(r.analysis_id);
    const meta: SavingsEvent['meta'] = capability === 'export' ? { kind: r.event } : {};
    if (analysisId != null) meta.analysis_id = analysisId;
    events.push({
      external_id: externalId,
      capability,
      occurred_at: new Date(Number(r.ts_ms)).toISOString(),
      user_hash: userHash(r.email, r.visitor_id),
      units: 1,
      dedupe_key: capability !== 'export' && analysisId != null ? `analysis:${analysisId}` : externalId,
      meta,
    });
  }

  // briefing_jobs: fertige Pre-Briefings (auch aus Batches und via MCP)
  const briefings = await rows<BriefingRow>(
    db,
    `SELECT id, analysis_id, batch_id, created_by, finished_at FROM briefing_jobs
     WHERE status = 'done' AND finished_at >= ? AND finished_at < ? ORDER BY finished_at ASC LIMIT ${limit}`,
    [dt(opts.sinceMs), dt(Math.ceil(opts.untilMs / 1000) * 1000)],
  );
  for (const r of briefings) {
    const occurredAt = isoOf(r.finished_at);
    if (!occurredAt || isAdmin(r.created_by)) continue;
    const meta: SavingsEvent['meta'] = { analysis_id: Number(r.analysis_id) };
    if (r.batch_id != null) meta.batch_id = Number(r.batch_id);
    if (r.created_by === 'mcp') meta.channel = 'mcp';
    events.push({
      external_id: `briefing:${r.id}`,
      capability: 'account_briefing',
      occurred_at: occurredAt,
      user_hash: userHash(r.created_by),
      units: 1,
      dedupe_key: `analysis:${Number(r.analysis_id)}`,
      meta,
    });
  }

  // batch_items: erfolgreich abgeschlossene Assessment-Items
  const items = await rows<ItemRow>(
    db,
    `SELECT i.id, i.batch_id, i.analysis_id, i.finished_at, b.created_by, b.kind
     FROM batch_items i JOIN batches b ON b.id = i.batch_id
     WHERE i.status = 'done' AND i.finished_at >= ? AND i.finished_at < ? ORDER BY i.finished_at ASC LIMIT ${limit}`,
    [dt(opts.sinceMs), dt(Math.ceil(opts.untilMs / 1000) * 1000)],
  );
  for (const r of items) {
    const occurredAt = isoOf(r.finished_at);
    if (!occurredAt || isAdmin(r.created_by)) continue;
    const externalId = `batchitem:${r.id}`;
    const meta: SavingsEvent['meta'] = { batch_id: Number(r.batch_id) };
    if (r.kind) meta.batch_kind = r.kind;
    if (r.created_by === 'mcp') meta.channel = 'mcp';
    events.push({
      external_id: externalId,
      capability: 'batch_assessment',
      occurred_at: occurredAt,
      user_hash: userHash(r.created_by),
      units: 1,
      dedupe_key: r.analysis_id != null ? `analysis:${Number(r.analysis_id)}` : externalId,
      meta,
    });
  }

  // DATETIME-Spalten haben Sekundenauflösung → Fenstergrenzen nochmals exakt prüfen.
  return events
    .filter((e) => {
      const ms = Date.parse(e.occurred_at);
      return ms >= opts.sinceMs && ms < opts.untilMs;
    })
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.external_id.localeCompare(b.external_id))
    .slice(0, limit);
}

/**
 * Effektive Admin-Liste für den Admin-View (Dashboard).
 *
 * - Fixe Admins: config.adminEmails (Owner daudert@adobe.com + ADMIN_EMAILS) —
 *   in der UI sichtbar, aber nicht entfernbar.
 * - Gepflegte Admins: Tabelle `admins`, verwaltet über /api/dashboard/admins.
 *
 * Der Admin-Status wird bei jedem Request live geprüft (nicht aus dem
 * Session-Token), damit Entfernen sofort wirkt. Kurzer Cache gegen DB-Last.
 */
import { config } from '../config.js';
import { deleteAdmin, insertAdmin, listAdminRows } from '../db/admins.js';
import { getPool } from '../db/index.js';
import type { DbHandle } from '../db/types.js';

const CACHE_TTL_MS = 30_000;
let cache: { at: number; emails: Set<string> } | null = null;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isFixedAdmin(email: string): boolean {
  return config.adminEmails.includes(normalizeEmail(email));
}

export function invalidateAdminCache(): void {
  cache = null;
}

async function dbAdminEmails(db: DbHandle | null): Promise<Set<string>> {
  if (!db) return new Set();
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.emails;
  try {
    const emails = new Set((await listAdminRows(db)).map((r) => r.email));
    cache = { at: Date.now(), emails };
    return emails;
  } catch (err) {
    // DB weg → nur fixe Admins (fail closed für gepflegte Admins).
    console.error('Admin-Liste nicht lesbar:', err);
    return new Set();
  }
}

export async function isAdminEmail(email: string | undefined | null, db: DbHandle | null = getPool()): Promise<boolean> {
  if (!email) return false;
  const e = normalizeEmail(email);
  if (isFixedAdmin(e)) return true;
  return (await dbAdminEmails(db)).has(e);
}

export interface AdminEntry {
  email: string;
  fixed: boolean;
  addedBy: string | null;
  addedAt: string | null;
}

export async function listAdmins(db: DbHandle): Promise<AdminEntry[]> {
  const rows = await listAdminRows(db);
  const fixed: AdminEntry[] = config.adminEmails.map((email) => ({ email, fixed: true, addedBy: null, addedAt: null }));
  const managed: AdminEntry[] = rows
    .filter((r) => !isFixedAdmin(r.email))
    .map((r) => ({ email: r.email, fixed: false, addedBy: r.added_by, addedAt: new Date(r.added_at_ms).toISOString() }));
  return [...fixed, ...managed];
}

export async function addAdmin(db: DbHandle, email: string, addedBy: string): Promise<'added' | 'exists'> {
  const e = normalizeEmail(email);
  if (isFixedAdmin(e)) return 'exists';
  const added = await insertAdmin(db, e, normalizeEmail(addedBy));
  invalidateAdminCache();
  return added ? 'added' : 'exists';
}

export async function removeAdmin(db: DbHandle, email: string): Promise<boolean> {
  const removed = await deleteAdmin(db, normalizeEmail(email));
  invalidateAdminCache();
  return removed;
}

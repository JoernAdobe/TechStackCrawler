import type { LibraryAccount } from '../types/library';

/** Gleiche Normalisierung wie der Server: Hostname, klein, ohne „www.“. */
export function accountKeyForUrl(url: string): string {
  const raw = url.trim();
  if (!raw) return '';
  try {
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, '') || raw.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

export function findAccountForUrl(accounts: LibraryAccount[], url: string): LibraryAccount | undefined {
  const key = accountKeyForUrl(url);
  if (!key || !key.includes('.')) return undefined;
  return accounts.find((a) => a.key === key);
}

/** Anfangsbuchstabe für die A–Z-Gruppierung; Ziffern/Sonderzeichen → „#“. */
export function letterOf(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}

export const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];

const DAY_MS = 86_400_000;

export function ageInDays(iso: string, now = Date.now()): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((now - t) / DAY_MS));
}

/** „today“, „3 days ago“, „2 months ago“ … */
export function relativeAge(iso: string, now = Date.now()): string {
  const days = ageInDays(iso, now);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years <= 1 ? '1 year ago' : `${years} years ago`;
}

/** Ab diesem Alter wird eine Analyse als „veraltet“ markiert und ein Re-analyze empfohlen. */
export const STALE_AFTER_DAYS = 90;

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

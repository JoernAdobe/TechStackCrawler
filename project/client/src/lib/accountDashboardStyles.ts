/** Gemeinsame Klassen/Helfer für das Account-Dashboard (Bulk-/Account-Assessment). */
export const card = 'p-5 rounded-2xl border border-ts-border bg-ts-surface-card min-w-0';
export const th = 'text-left px-3 py-2 font-semibold text-ts-text-secondary whitespace-nowrap';
export const td = 'px-3 py-2';

export function scoreClass(v: number | null | undefined, good = 80, ok = 50): string {
  if (v === null || v === undefined) return 'text-ts-text-secondary';
  return v >= good ? 'text-ts-success' : v >= ok ? 'text-ts-warning' : 'text-adobe-red';
}

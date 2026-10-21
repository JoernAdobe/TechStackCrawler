import type { BatchJob } from '../types/parity';
import type { BriefingSummary } from '../types/briefing';

export type BatchItem = NonNullable<BatchJob['items']>[number];
export type BriefingSort = 'none' | 'desc' | 'asc';

export const isBriefingOpen = (b?: BriefingSummary) => b?.status === 'queued' || b?.status === 'running';

export function batchHasBriefings(batch: BatchJob): boolean {
  return batch.enrichmentOptions?.briefing === true || (batch.items ?? []).some((it) => it.enrichments?.briefing);
}

export const nextBriefingSort = (s: BriefingSort): BriefingSort => (s === 'none' ? 'desc' : s === 'desc' ? 'asc' : 'none');

/** Sortiert nach Overall Pre-Briefing Score; Items ohne Score landen immer unten. */
export function sortByBriefingScore<T extends BatchItem>(items: T[], sort: BriefingSort): T[] {
  if (sort === 'none') return items;
  const score = (it: T) => it.enrichments?.briefing?.overallScore ?? null;
  return [...items].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sa == null && sb == null) return 0;
    if (sa == null) return 1;
    if (sb == null) return -1;
    return sort === 'desc' ? sb - sa : sa - sb;
  });
}

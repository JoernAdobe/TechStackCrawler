/** Noch laufende Semrush/Tranco-Abrufe je Analyse, damit das Pre-Briefing (begrenzt) darauf warten kann. */
const pending = new Map<number, Promise<unknown>>();

export function trackPendingTraffic(analysisId: number, job: Promise<unknown>): void {
  const settled = job.catch(() => undefined);
  pending.set(analysisId, settled);
  void settled.then(() => {
    if (pending.get(analysisId) === settled) pending.delete(analysisId);
  });
}

export async function awaitPendingTraffic(analysisId: number, timeoutMs: number): Promise<void> {
  const job = pending.get(analysisId);
  if (!job) return;
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([job, new Promise<void>((r) => { timer = setTimeout(r, timeoutMs); })]);
  clearTimeout(timer);
}

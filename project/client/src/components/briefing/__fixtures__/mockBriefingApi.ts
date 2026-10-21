/**
 * Dev-only Fetch-Shim für das Client Pre-Briefing (kein Server nötig).
 * Aktivierung per URL-Parameter `?mockBriefing=<mode>`:
 *   done (oder 1) – vorhandenes, fertiges Briefing
 *   progress      – laufender Job, der sich in ~45 s durchspielt
 *   none          – noch kein Briefing (CTA); „Generate“ startet die Simulation
 *   error         – fehlgeschlagener Job
 */
import {
  BRIEFING_SECTION_IDS,
  type BriefingJob,
  type BriefingProgress,
  type BriefingSectionId,
  type BriefingStateResponse,
} from '../../../types/briefing';
import { briefingFixture } from './briefingFixture';

type Mode = 'done' | 'progress' | 'none' | 'error';
const RUN_MS = 45_000;

interface MockState {
  job: BriefingJob | null;
  startMs: number;
}
const states = new Map<number, MockState>();

function mode(): Mode {
  const raw = new URLSearchParams(window.location.search).get('mockBriefing');
  if (raw === 'progress' || raw === 'none' || raw === 'error') return raw;
  return 'done';
}

function newJob(analysisId: number, sections: BriefingSectionId[], status: BriefingJob['status']): BriefingJob {
  const now = new Date().toISOString();
  return {
    id: briefingFixture.jobId, analysisId, status, sections, progress: [],
    companyName: briefingFixture.companyName, createdAt: now, startedAt: now,
  };
}

function progressAt(sections: BriefingSectionId[], fraction: number): BriefingProgress[] {
  const steps: Array<BriefingSectionId | 'executive' | 'render'> = [...sections, 'executive', 'render'];
  const pos = fraction * steps.length;
  return steps.map((step, i) => {
    if (i + 1 <= pos) {
      const fx = briefingFixture.sections.find((s) => s.id === step);
      const state = fx?.status === 'thin' ? 'thin' : fx?.status === 'error' ? 'error' : 'done';
      return { step, state, ...(state === 'error' ? { message: 'Search provider rate-limited' } : {}) };
    }
    if (i < pos) return { step, state: pos - i < 0.5 ? 'researching' : 'writing' };
    return { step, state: 'pending' };
  });
}

function stateFor(analysisId: number): MockState {
  let st = states.get(analysisId);
  if (!st) {
    const m = mode();
    const all = [...BRIEFING_SECTION_IDS];
    st = { job: null, startMs: Date.now() };
    if (m === 'done') st.job = { ...newJob(analysisId, all, 'done'), finishedAt: new Date().toISOString() };
    if (m === 'error') st.job = { ...newJob(analysisId, all, 'error'), error: 'Bedrock request timed out after 3 retries.' };
    if (m === 'progress') {
      st.job = newJob(analysisId, all, 'running');
      st.startMs = Date.now() - RUN_MS * 0.35;
    }
    states.set(analysisId, st);
  }
  return st;
}

function snapshot(st: MockState): BriefingStateResponse {
  const job = st.job;
  if (!job) return { job: null, result: null };
  if (job.status === 'running' || job.status === 'queued') {
    const fraction = Math.min(1, (Date.now() - st.startMs) / RUN_MS);
    job.progress = progressAt(job.sections, fraction);
    if (fraction >= 1) {
      job.status = 'done';
      job.finishedAt = new Date().toISOString();
    }
  }
  const result = job.status === 'done' ? { ...briefingFixture, analysisId: job.analysisId } : null;
  return { job: { ...job, progress: [...job.progress] }, result };
}

const delay = <T,>(value: T) => new Promise<T>((r) => setTimeout(() => r(value), 250));

export async function mockBriefingRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  const byAnalysis = path.match(/^\/api\/analyses\/(\d+)\/briefing$/);
  if (byAnalysis) {
    const st = stateFor(Number(byAnalysis[1]));
    if (method === 'POST') {
      const sections = (body as { sections?: BriefingSectionId[] })?.sections ?? [...BRIEFING_SECTION_IDS];
      if (!st.job || !['queued', 'running'].includes(st.job.status)) {
        st.job = newJob(Number(byAnalysis[1]), sections, 'running');
        st.startMs = Date.now();
      }
      return delay(snapshot(st).job as T);
    }
    return delay(snapshot(st) as T);
  }
  const byJob = path.match(/^\/api\/briefings\/(\d+)(\/cancel)?$/);
  const st = [...states.values()].find((s) => s.job && byJob && s.job.id === Number(byJob[1]));
  if (byJob && st?.job) {
    if (byJob[2]) {
      st.job = { ...st.job, status: 'cancelled', finishedAt: new Date().toISOString() };
      return delay(st.job as T);
    }
    return delay(snapshot(st) as T);
  }
  throw new Error(`mockBriefing: unhandled ${method} ${path}`);
}

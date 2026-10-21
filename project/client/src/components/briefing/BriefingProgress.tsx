import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Circle, Loader2, Minus, PenLine, Search, X } from 'lucide-react';
import type { BriefingJob, BriefingProgress as Progress, BriefingSectionProgressState } from '../../types/briefing';
import { sectionTitle } from './meta';

const STATE_UI: Record<BriefingSectionProgressState, { label: string; Icon: typeof Check; cls: string; spin?: boolean }> = {
  pending: { label: 'Pending', Icon: Circle, cls: 'text-ts-text-secondary/60' },
  researching: { label: 'Researching', Icon: Search, cls: 'text-sky-300' },
  writing: { label: 'Writing', Icon: PenLine, cls: 'text-violet-300' },
  done: { label: 'Done', Icon: Check, cls: 'text-emerald-300' },
  thin: { label: 'Thin data', Icon: AlertTriangle, cls: 'text-amber-300' },
  skipped: { label: 'Skipped', Icon: Minus, cls: 'text-ts-text-secondary' },
  error: { label: 'Error', Icon: X, cls: 'text-red-300' },
};
const FINISHED: ReadonlySet<BriefingSectionProgressState> = new Set(['done', 'thin', 'skipped', 'error']);

function stepLabel(step: Progress['step']): string {
  if (step === 'executive') return 'Executive summary & score';
  if (step === 'render') return 'Render & validate report';
  return sectionTitle(step);
}

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

interface BriefingProgressProps {
  job: BriefingJob;
  onCancel: () => void;
  busy?: boolean;
  pollError?: string | null;
}

/** Live-Fortschritt eines laufenden Briefing-Jobs (pro Abschnitt + Executive + Render). */
export default function BriefingProgress({ job, onCancel, busy, pollError }: BriefingProgressProps) {
  const now = useNow(1000);
  const byStep = new Map(job.progress.map((p) => [p.step, p]));
  const steps: Progress[] = [...job.sections, 'executive' as const, 'render' as const].map(
    (step) => byStep.get(step) ?? { step, state: 'pending' },
  );
  const finished = steps.filter((s) => FINISHED.has(s.state)).length;
  const pct = Math.round((finished / steps.length) * 100);
  const started = Date.parse(job.startedAt ?? job.createdAt);
  const current = steps.find((s) => s.state === 'researching' || s.state === 'writing');

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-adobe-red motion-reduce:animate-none" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-ts-text-primary">
              {job.status === 'queued' ? 'Queued – waiting for a free slot…' : `Researching ${job.companyName ?? 'the client'}…`}
            </p>
            <p className="text-xs text-ts-text-secondary">
              Elapsed {Number.isFinite(started) ? formatElapsed(now - started) : '–'} · usually 5–10 minutes · you can keep
              reading the analysis below
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-ts-border px-3 py-1.5 text-sm text-ts-text-primary transition-colors hover:border-adobe-red/50 hover:bg-adobe-red/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-adobe-red disabled:opacity-50 sm:self-auto"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Cancel
        </button>
      </div>

      <div
        role="progressbar"
        aria-label="Briefing progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${finished} of ${steps.length} steps done${current ? `, ${stepLabel(current.step)}` : ''}`}
        className="h-1.5 overflow-hidden rounded-full bg-ts-border"
      >
        <div className="h-full rounded-full bg-gradient-to-r from-adobe-red to-amber-400 transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${Math.max(3, pct)}%` }} />
      </div>

      {pollError && (
        <p role="status" className="flex items-center gap-2 text-xs text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          {pollError}
        </p>
      )}

      <ol className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2" aria-label="Briefing steps">
        {steps.map((s) => {
          const ui = STATE_UI[s.state] ?? STATE_UI.pending;
          const activeStep = s.state === 'researching' || s.state === 'writing';
          return (
            <li key={s.step} className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${activeStep ? 'bg-ts-surface-light' : ''}`}>
              <ui.Icon className={`h-4 w-4 shrink-0 ${ui.cls} ${activeStep ? 'motion-safe:animate-pulse' : ''}`} aria-hidden="true" />
              <span className={`min-w-0 flex-1 truncate ${s.state === 'pending' ? 'text-ts-text-secondary' : 'text-ts-text-primary'}`}>
                {stepLabel(s.step)}
              </span>
              <span className={`shrink-0 text-xs ${ui.cls}`} title={s.message}>{ui.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ChevronDown, Download, ExternalLink, FileDown, FileSearch, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { BRIEFING_CREDIT, type BriefingSectionId } from '../../types/briefing';
import { briefingPdfUrl, briefingReportUrl, useBriefing } from '../../hooks/useBriefing';
import { BriefingSectionPicker } from './BriefingSectionPicker';
import BriefingProgress from './BriefingProgress';
import ExecutiveSummary from './ExecutiveSummary';
import BriefingReport from './BriefingReport';
import ReviewSourcesNote from './ReviewSourcesNote';
import { loadBriefingSections } from './prefs';
import { normalizeSections, prefersReducedMotion, sectionAnchor } from './meta';
import { BRIEFING_SUBNAV_LABEL, BRIEFING_SUMMARY_ANCHOR, publishBriefingResult } from './briefingStore';
import BriefingSubNav from './BriefingSubNav';

interface BriefingPanelProps {
  analysisId?: number;
  autoStartSections?: BriefingSectionId[] | null;
  onAutoStartConsumed?: () => void;
}

const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-adobe-red disabled:opacity-50';
const btnGhost = `${btn} border border-ts-border text-ts-text-primary hover:border-ts-accent/50 hover:bg-ts-surface-light`;
const btnPrimary = `${btn} bg-gradient-to-r from-adobe-red to-adobe-red-dark text-white hover:from-adobe-red-dark hover:to-[#B03522] shadow-glow-red`;

function Cta({ initial, onStart, busy, onCancel }: {
  initial: BriefingSectionId[]; onStart: (s: BriefingSectionId[]) => void; busy: boolean; onCancel?: () => void;
}) {
  const [sections, setSections] = useState(initial);
  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-ts-text-secondary">
        A researched, source-backed client briefing with an Overall Pre-Briefing Score, C-level summary and
        Adobe plays. Runs in the background (usually 5–10 minutes).
      </p>
      <div className="rounded-xl border border-ts-border bg-ts-surface-light/50 p-4">
        <BriefingSectionPicker value={sections} onChange={setSections} compact disabled={busy} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnPrimary} onClick={() => onStart(normalizeSections(sections))} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
          Generate Client Pre-Briefing
        </button>
        {onCancel && <button type="button" className={btnGhost} onClick={onCancel} disabled={busy}>Cancel</button>}
      </div>
    </div>
  );
}

/** Einstieg für C-Level: Client Pre-Briefing direkt unter den Scan-Warnungen. */
export default function BriefingPanel({ analysisId, autoStartSections, onAutoStartConsumed }: BriefingPanelProps) {
  const { job, result, loading, error, pollError, busy, active, start, cancel } = useBriefing(analysisId, {
    autoStartSections, onAutoStartConsumed,
  });
  const [regenerating, setRegenerating] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [scrollRequest, setScrollRequest] = useState(0);
  const scrollTarget = useRef<string | null>(null);

  useEffect(() => {
    if (analysisId == null) return;
    publishBriefingResult(analysisId, job?.status === 'done' ? result : null);
  }, [analysisId, job?.status, result]);

  useEffect(() => () => {
    if (analysisId != null) publishBriefingResult(analysisId, null);
  }, [analysisId]);

  const scrollToEl = useCallback((el: HTMLElement) => {
    // Sticky Header + Sektions-Nav + Pre-Briefing-Subnav überdecken sonst den Abschnittsanfang.
    const header = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
    const nav = document.querySelector('nav[aria-label="Result sections"]')?.getBoundingClientRect().height ?? 0;
    const sub = document.querySelector(`nav[aria-label="${BRIEFING_SUBNAV_LABEL}"]`)?.getBoundingClientRect().height ?? 0;
    const top = el.getBoundingClientRect().top + window.scrollY - Math.max(0, header) - nav - sub - 16;
    window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
  }, []);

  const drill = useCallback((id: BriefingSectionId) => {
    scrollTarget.current = sectionAnchor(id);
    setReportOpen(true);
    setHighlight(sectionAnchor(id));
    setScrollRequest((n) => n + 1);
  }, []);

  useEffect(() => {
    const target = scrollTarget.current;
    if (!scrollRequest || !target) return;
    const el = document.getElementById(target);
    if (el) scrollToEl(el);
    const timer = setTimeout(() => setHighlight(null), 2200);
    return () => clearTimeout(timer);
  }, [scrollRequest, scrollToEl]);

  const handleStart = async (sections: BriefingSectionId[]) => {
    await start(sections);
    setRegenerating(false);
    setReportOpen(false);
  };

  if (analysisId == null) return null;

  const done = job?.status === 'done' && result;
  const failed = job && (job.status === 'error' || job.status === 'cancelled');

  let body: ReactNode;
  if (loading) {
    body = (
      <p className="flex items-center gap-2 text-sm text-ts-text-secondary" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {pollError ?? 'Loading Client Pre-Briefing…'}
      </p>
    );
  } else if (regenerating || !job) {
    body = (
      <Cta
        initial={job?.sections.length ? job.sections : loadBriefingSections()}
        onStart={handleStart}
        busy={busy}
        onCancel={regenerating ? () => setRegenerating(false) : undefined}
      />
    );
  } else if (active) {
    body = <BriefingProgress job={job} onCancel={cancel} busy={busy} pollError={pollError} />;
  } else if (failed || !done) {
    body = (
      <div role="alert" className="flex flex-col gap-3 rounded-xl border border-adobe-red/40 bg-adobe-red/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-sm text-ts-text-primary">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-adobe-red" aria-hidden="true" />
          {job.status === 'cancelled'
            ? 'The briefing was cancelled.'
            : job.error || 'The briefing finished, but no result is available.'}
        </p>
        <div className="flex gap-2">
          <button type="button" className={btnPrimary} onClick={() => start(job.sections)} disabled={busy}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
          </button>
          <button type="button" className={btnGhost} onClick={() => setRegenerating(true)} disabled={busy}>Change sections</button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="space-y-6">
        <BriefingSubNav
          result={result}
          onSection={drill}
          onSummary={() => {
            const el = document.getElementById(BRIEFING_SUMMARY_ANCHOR);
            if (el) scrollToEl(el);
          }}
        />
        <div id={BRIEFING_SUMMARY_ANCHOR} tabIndex={-1} className="focus:outline-none">
          <ExecutiveSummary result={result} onDrill={drill} />
        </div>
        <ReviewSourcesNote />
        <div className="border-t border-ts-border pt-4">
          <button
            type="button"
            aria-expanded={reportOpen}
            aria-controls="briefing-full-report"
            onClick={() => setReportOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-adobe-red"
          >
            <span>
              <span className="block text-base font-semibold text-ts-text-primary">Full briefing</span>
              <span className="block text-xs text-ts-text-secondary">
                {result.sections.filter((s) => s.status !== 'skipped').length} sections with sources and gaps
              </span>
            </span>
            <ChevronDown className={`h-5 w-5 text-ts-text-secondary transition-transform motion-reduce:transition-none ${reportOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          <div id="briefing-full-report" className="mt-4" hidden={!reportOpen}>
            {reportOpen && <BriefingReport result={result} highlightId={highlight} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section id="section-briefing" aria-labelledby="briefing-panel-title" className="mx-auto max-w-7xl scroll-mt-28 px-4 py-8 sm:px-6">
      <div className="overflow-clip rounded-2xl border border-ts-border bg-ts-surface-card">
        <div className="flex flex-col gap-4 border-b border-ts-border bg-gradient-to-br from-adobe-red/10 via-ts-surface-card to-ts-accent/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 id="briefing-panel-title" className="flex items-center gap-2 text-xl font-semibold text-ts-text-primary">
              <FileSearch className="h-6 w-6 text-adobe-red" strokeWidth={1.5} aria-hidden="true" />
              Client Pre-Briefing
            </h2>
            <p className="mt-1 text-xs text-ts-text-secondary">{BRIEFING_CREDIT}</p>
          </div>
          {done && job && !regenerating && (
            <div className="flex flex-wrap gap-2">
              <a href={briefingReportUrl(job.id)} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open full report
              </a>
              <a href={briefingPdfUrl(job.id)} className={btnGhost} download>
                <FileDown className="h-4 w-4" aria-hidden="true" /> Download PDF
              </a>
              <a href={briefingReportUrl(job.id, true)} className={btnGhost} download>
                <Download className="h-4 w-4" aria-hidden="true" /> Download HTML
              </a>
              <button type="button" className={btnGhost} onClick={() => setRegenerating(true)} disabled={busy}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Regenerate
              </button>
            </div>
          )}
        </div>
        <div className="p-4 sm:p-6">
          {error && (
            <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-adobe-red/40 bg-adobe-red/10 px-3 py-2 text-sm text-ts-text-primary">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-adobe-red" aria-hidden="true" />
              <span className="whitespace-pre-line">{error}</span>
            </p>
          )}
          {body}
        </div>
      </div>
    </section>
  );
}

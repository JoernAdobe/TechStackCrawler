import { useState, useEffect, useRef } from 'react';
import { Globe, Search, Bot, CheckCircle2, XCircle } from 'lucide-react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import type { ProgressEvent } from '../types/analysis';

gsap.registerPlugin(useGSAP);

interface AnalysisProgressProps {
  events: ProgressEvent[];
  onCancel: () => void;
}

function useElapsedTime(isActive: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isActive) return;
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [isActive]);
  return elapsed;
}

const phaseIcons: Record<string, typeof Globe> = {
  scraping: Globe,
  detecting: Search,
  analyzing: Bot,
  complete: CheckCircle2,
  error: XCircle,
};

const phaseLabels: Record<string, string> = {
  scraping: 'Scraping Website',
  detecting: 'Detecting Technologies',
  analyzing: 'AI Analysis',
  complete: 'Complete',
  error: 'Error',
};

const phaseColors: Record<string, string> = {
  scraping: 'text-blue-400',
  detecting: 'text-ts-accent-light',
  analyzing: 'text-amber-400',
  complete: 'text-ts-success',
  error: 'text-red-400',
};

export default function AnalysisProgress({
  events,
  onCancel,
}: AnalysisProgressProps) {
  const currentPhase = events[events.length - 1]?.phase || 'scraping';
  const phases = ['scraping', 'detecting', 'analyzing'];
  const currentIndex = phases.indexOf(currentPhase);
  const elapsed = useElapsedTime(true);
  const logRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!logRef.current) return;
      const items = logRef.current.querySelectorAll('.log-entry');
      if (items.length === 0) return;
      const last = items[items.length - 1];
      gsap.fromTo(last, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.4, ease: 'power2.out' });
    },
    { dependencies: [events.length], scope: logRef },
  );

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  const CurrentIcon = phaseIcons[currentPhase] || Globe;

  return (
    <div ref={containerRef} className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <div className="w-full max-w-xl">
        {/* Animated orbital center */}
        <div className="flex flex-col items-center justify-center mb-10">
          <div className="relative w-28 h-28 flex items-center justify-center">
            {/* Outer orbit ring */}
            <div className="absolute inset-0 rounded-full border border-ts-accent/20" />
            <div className="absolute inset-[-8px] rounded-full border border-adobe-red/10" />

            {/* Orbiting dots */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-orbit">
                <div className="w-2.5 h-2.5 rounded-full bg-ts-accent shadow-glow-accent" />
              </div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-orbit-reverse">
                <div className="w-2 h-2 rounded-full bg-adobe-red shadow-glow-red" />
              </div>
            </div>

            {/* Center icon */}
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-ts-surface-card to-ts-surface-light border border-ts-border flex items-center justify-center shadow-glow-accent">
              <CurrentIcon className={`w-8 h-8 ${phaseColors[currentPhase]} ${currentPhase !== 'complete' ? 'animate-pulse' : ''}`} strokeWidth={1.5} />
            </div>
          </div>

          <p className="mt-4 text-sm font-medium text-ts-text-primary">
            {phaseLabels[currentPhase]}
          </p>
          <p className="mt-1 text-xs text-ts-accent animate-pulse-glow">
            Processing...
          </p>
        </div>

        {/* Progress bar with shimmer */}
        <div className="mb-8">
          <div className="flex justify-between mb-3">
            {phases.map((phase, i) => {
              const Icon = phaseIcons[phase];
              return (
                <div
                  key={phase}
                  className={`flex items-center gap-2 text-sm transition-all duration-500 ${
                    i <= currentIndex
                      ? 'text-ts-text-primary'
                      : 'text-ts-text-secondary/40'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${i <= currentIndex ? phaseColors[phase] : ''} ${i === currentIndex ? 'animate-pulse' : ''}`} strokeWidth={2} />
                  <span className="hidden sm:inline text-xs">
                    {phaseLabels[phase]}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="h-2 bg-ts-surface-card rounded-full overflow-hidden border border-ts-border/50">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden"
              style={{
                width: `${Math.min(95, ((currentIndex + 0.5) / phases.length) * 100)}%`,
                background: 'linear-gradient(90deg, #EB1000, #6366f1, #EB1000)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 2s linear infinite',
              }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-ts-text-secondary">
            <span className="text-ts-accent">Analysis in progress</span>
            <span className="tabular-nums">Elapsed: {formatTime(elapsed)}</span>
          </div>
        </div>

        {/* Event log */}
        <p className="text-xs text-ts-text-secondary mb-2 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-ts-success animate-pulse" />
          Live updates
        </p>
        <div ref={logRef} className="relative bg-ts-surface-card rounded-xl border border-ts-border p-4 max-h-64 overflow-y-auto">
          {events.map((event, i) => {
            const techs =
              event.data?.technologies &&
              Array.isArray(event.data.technologies)
                ? (event.data.technologies as string[])
                : null;

            const isLast = i === events.length - 1;
            const PhaseIcon = phaseIcons[event.phase] || Globe;
            return (
              <div
                key={i}
                className={`log-entry flex items-start gap-3 py-2.5 ${
                  i < events.length - 1
                    ? 'opacity-40 text-ts-text-secondary'
                    : 'text-ts-text-primary'
                } ${i > 0 ? 'border-t border-ts-border/30' : ''}`}
              >
                <span className="mt-0.5 shrink-0 flex items-center justify-center w-6">
                  {isLast ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-ts-accent/30 border-t-ts-accent" />
                  ) : (
                    <PhaseIcon className={`w-4 h-4 ${phaseColors[event.phase]}`} strokeWidth={2} />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{event.message}</p>
                  {techs && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {techs.slice(0, 10).map((tech) => (
                        <span
                          key={tech}
                          className="text-xs bg-ts-accent/10 text-ts-accent-light px-2 py-0.5 rounded-full border border-ts-accent/20"
                        >
                          {tech}
                        </span>
                      ))}
                      {techs.length > 10 && (
                        <span className="text-xs text-ts-text-secondary">
                          +{techs.length - 10} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-xs text-ts-text-secondary/50 shrink-0 tabular-nums">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>
            );
          })}
        </div>

        {/* Cancel button */}
        <div className="mt-6 text-center">
          <button
            onClick={onCancel}
            className="text-sm text-ts-text-secondary hover:text-ts-text-primary transition-colors px-4 py-2 rounded-lg hover:bg-ts-surface-card border border-transparent hover:border-ts-border"
          >
            Cancel Analysis
          </button>
        </div>
      </div>
    </div>
  );
}

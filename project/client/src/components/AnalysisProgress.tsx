import { useState, useEffect } from 'react';
import type { ProgressEvent } from '../types/analysis';

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

const phaseIcons: Record<string, string> = {
  scraping: '🌐',
  detecting: '🔍',
  analyzing: '🤖',
  complete: '✅',
  error: '❌',
};

const phaseLabels: Record<string, string> = {
  scraping: 'Scraping Website',
  detecting: 'Detecting Technologies',
  analyzing: 'AI Analysis',
  complete: 'Complete',
  error: 'Error',
};

export default function AnalysisProgress({
  events,
  onCancel,
}: AnalysisProgressProps) {
  const currentPhase = events[events.length - 1]?.phase || 'scraping';
  const phases = ['scraping', 'detecting', 'analyzing'];
  const currentIndex = phases.indexOf(currentPhase);
  const elapsed = useElapsedTime(true);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <div className="w-full max-w-xl">
        {/* Progress bar */}
        <div className="mb-10">
          <div className="flex justify-between mb-3">
            {phases.map((phase, i) => (
              <div
                key={phase}
                className={`flex items-center gap-2 text-sm transition-colors ${
                  i <= currentIndex
                    ? 'text-ts-text-primary'
                    : 'text-ts-text-secondary/40'
                }`}
              >
                <span>{phaseIcons[phase]}</span>
                <span className="hidden sm:inline">
                  {phaseLabels[phase]}
                </span>
              </div>
            ))}
          </div>
          <div className="h-1.5 bg-ts-surface-card rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-adobe-red to-ts-accent rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${((currentIndex + 1) / phases.length) * 100}%`,
              }}
            />
          </div>
          <div className="mt-1 text-right text-xs text-ts-text-secondary">
            Elapsed: {formatTime(elapsed)}
          </div>
        </div>

        {/* Animated pulse */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-adobe-red/20 to-ts-accent/20 flex items-center justify-center animate-pulse">
              <span className="text-3xl">{phaseIcons[currentPhase]}</span>
            </div>
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-adobe-red/10 to-ts-accent/10 animate-ping" />
          </div>
        </div>

        {/* Event log */}
        <p className="text-xs text-ts-text-secondary mb-2">
          Live updates from the analysis
        </p>
        <div className="bg-ts-surface-card rounded-xl border border-ts-border p-4 max-h-64 overflow-y-auto">
          {events.map((event, i) => {
            const techs =
              event.data?.technologies &&
              Array.isArray(event.data.technologies)
                ? (event.data.technologies as string[])
                : null;

            return (
            <div
              key={i}
              className={`flex items-start gap-3 py-2 ${
                i < events.length - 1
                  ? 'opacity-50 text-ts-text-secondary'
                  : 'text-ts-text-primary'
              } ${i > 0 ? 'border-t border-ts-border/30' : ''}`}
            >
              <span className="text-sm mt-0.5 shrink-0">
                {phaseIcons[event.phase]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm">{event.message}</p>
                {techs && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {techs.slice(0, 10).map((tech) => (
                        <span
                          key={tech}
                          className="text-xs bg-ts-accent/10 text-ts-accent-light px-2 py-0.5 rounded-full"
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
              <span className="text-xs text-ts-text-secondary/50 shrink-0">
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
            className="text-sm text-ts-text-secondary hover:text-ts-text-primary transition-colors"
          >
            Cancel Analysis
          </button>
        </div>
      </div>
    </div>
  );
}

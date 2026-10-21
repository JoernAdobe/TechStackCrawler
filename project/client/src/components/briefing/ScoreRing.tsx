import { useEffect, useState } from 'react';
import type { ScoreBand } from '../../types/briefing';
import { BAND_STYLES, prefersReducedMotion } from './meta';

interface ScoreRingProps {
  score: number | null;
  band: ScoreBand;
  size?: number;
  label?: string;
}

/** Animierter SVG-Ring für den „Overall Pre-Briefing Score“ (0–100). */
export default function ScoreRing({ score, band, size = 168, label = 'Overall Pre-Briefing Score' }: ScoreRingProps) {
  const [shown, setShown] = useState(() => prefersReducedMotion());
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const stroke = Math.max(8, Math.round(size / 14));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const value = score == null ? 0 : Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - (shown ? value : 0) / 100);
  const style = BAND_STYLES[band];
  const ariaText = score == null ? `${label}: not enough data` : `${label}: ${Math.round(value)} of 100, ${style.label}`;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={ariaText}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-ts-border" />
        {score != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={style.stroke}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-[1200ms] ease-out motion-reduce:transition-none"
            style={{ filter: `drop-shadow(0 0 6px ${style.stroke}55)` }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden="true">
        {score == null ? (
          <>
            <span className="text-2xl font-bold text-ts-text-secondary">—</span>
            <span className="mt-1 max-w-[70%] text-xs leading-tight text-ts-text-secondary">Not enough data</span>
          </>
        ) : (
          <>
            <span className="font-bold tabular-nums text-ts-text-primary" style={{ fontSize: size * 0.3 }}>
              {Math.round(value)}
            </span>
            <span className="text-xs text-ts-text-secondary">of 100</span>
          </>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Globe } from 'lucide-react';
import { BAND_STYLES } from '../briefing/meta';
import type { BriefingSummary } from '../../types/briefing';
import { accountKeyForUrl } from '../../lib/library';

/** Favicon mit Platzhalter (Fallback über React-State statt DOM-Manipulation). */
export function Favicon({ url, size = 'md' }: { url: string; size?: 'sm' | 'md' }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const cls = size === 'sm' ? 'w-5 h-5' : 'w-7 h-7';
  if (failedUrl === url) {
    return (
      <span className={`flex items-center justify-center ${cls}`} aria-hidden="true">
        <Globe className={`${cls} text-ts-text-secondary`} strokeWidth={1.5} />
      </span>
    );
  }
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(accountKeyForUrl(url))}&sz=64`}
      alt=""
      className={cls}
      onError={() => setFailedUrl(url)}
    />
  );
}

export function BriefingScoreBadge({ briefing }: { briefing?: BriefingSummary }) {
  if (!briefing || briefing.status !== 'done' || briefing.overallScore == null) return null;
  const band = BAND_STYLES[briefing.band ?? 'medium'];
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${band.chip}`}
      title={`Overall Pre-Briefing Score: ${Math.round(briefing.overallScore)} of 100`}
    >
      Pre-Briefing {Math.round(briefing.overallScore)}
    </span>
  );
}

import { ArrowDown, ArrowUp, ArrowUpDown, Loader2 } from 'lucide-react';
import { BAND_STYLES, bandForScore } from './briefing/meta';
import { isBriefingOpen, type BatchItem, type BriefingSort } from '../lib/batchBriefing';

export function BriefingSortHeader({ sort, onSort }: { sort: BriefingSort; onSort: () => void }) {
  const Icon = sort === 'desc' ? ArrowDown : sort === 'asc' ? ArrowUp : ArrowUpDown;
  return (
    <th className="text-left px-3 py-2" aria-sort={sort === 'none' ? 'none' : sort === 'desc' ? 'descending' : 'ascending'}>
      <button type="button" onClick={onSort} className="inline-flex items-center gap-1 hover:text-ts-text-primary">
        Pre-Briefing Score <Icon className="w-3 h-3" aria-hidden="true" />
      </button>
    </th>
  );
}

const MINI = 22;
const STROKE = 3;

/** Mini-Score-Ring + Status; Klick öffnet die Analyse mit dem vollständigen Briefing-Panel. */
export function BriefingScoreCell({ item, onOpenAnalysis }: { item: BatchItem; onOpenAnalysis?: (id: number) => void }) {
  const b = item.enrichments?.briefing;
  if (!b) return <span className="text-ts-text-secondary">—</span>;
  const band = b.band ?? (b.overallScore != null ? bandForScore(b.overallScore) : undefined);
  const style = band ? BAND_STYLES[band] : undefined;
  let body;
  if (b.status === 'done' && b.overallScore != null && style) {
    const r = (MINI - STROKE) / 2;
    const c = 2 * Math.PI * r;
    body = (
      <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-full border ${style.chip}`}>
        <svg width={MINI} height={MINI} viewBox={`0 0 ${MINI} ${MINI}`} className="-rotate-90" aria-hidden="true">
          <circle cx={MINI / 2} cy={MINI / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={STROKE} />
          <circle
            cx={MINI / 2}
            cy={MINI / 2}
            r={r}
            fill="none"
            stroke={style.stroke}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - Math.max(0, Math.min(100, b.overallScore)) / 100)}
          />
        </svg>
        <span className="font-semibold tabular-nums">{Math.round(b.overallScore)}</span>
      </span>
    );
  } else if (isBriefingOpen(b)) {
    body = (
      <span className="inline-flex items-center gap-1 text-sky-300">
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> {b.status}
      </span>
    );
  } else {
    body = <span className={b.status === 'error' ? 'text-adobe-red' : 'text-ts-text-secondary'}>{b.status === 'done' ? 'n/a' : b.status}</span>;
  }
  const title = [
    b.overallScore != null ? `Overall Pre-Briefing Score ${Math.round(b.overallScore)}/100` : `Status: ${b.status}`,
    style?.label,
    b.confidence ? `Confidence: ${b.confidence}` : undefined,
    b.verdict,
  ]
    .filter(Boolean)
    .join('\n');
  if (!onOpenAnalysis || !item.analysisId) return <span title={title}>{body}</span>;
  return (
    <button type="button" title={title} onClick={() => onOpenAnalysis(item.analysisId!)} className="hover:opacity-80">
      {body}
    </button>
  );
}

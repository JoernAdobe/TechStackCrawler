import { ExternalLink } from 'lucide-react';
import type { BriefingSource } from '../../types/briefing';
import { safeHref } from './meta';

function Badge({ children, tone }: { children: string; tone: 'ok' | 'warn' | 'muted' }) {
  const cls = {
    ok: 'border-emerald-400/30 text-emerald-200',
    warn: 'border-amber-400/40 text-amber-200',
    muted: 'border-ts-border text-ts-text-secondary',
  }[tone];
  return <span className={`rounded-full border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide ${cls}`}>{children}</span>;
}

export function SourceLink({ source, className = '' }: { source: BriefingSource; className?: string }) {
  const href = safeHref(source.url);
  const title = source.title || source.url;
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-baseline gap-1 text-ts-accent-light underline-offset-2 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-adobe-red ${className}`}
    >
      <span>{title}</span>
      <ExternalLink className="h-3 w-3 shrink-0 self-center" aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  ) : (
    <span className={className}>{title}</span>
  );
}

/** Kurze Quellenangabe (Fußnote) unter Bullets/Kacheln. */
export function SourceFootnote({ source }: { source: BriefingSource }) {
  return (
    <span className="text-xs text-ts-text-secondary">
      Source: <SourceLink source={source} />
      {(source.publisher || source.date) && ` · ${[source.publisher, source.date].filter(Boolean).join(', ')}`}
    </span>
  );
}

export function SourceList({ sources }: { sources: BriefingSource[] }) {
  if (sources.length === 0) return null;
  return (
    <ol className="space-y-1.5 text-sm">
      {sources.map((s, i) => (
        <li key={`${s.url}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="w-5 shrink-0 text-right text-xs tabular-nums text-ts-text-secondary">{i + 1}.</span>
          <SourceLink source={s} className="min-w-0 break-words" />
          <span className="text-xs text-ts-text-secondary">
            {[s.publisher, s.date].filter(Boolean).join(' · ')}
          </span>
          <Badge tone={s.independent ? 'ok' : 'muted'}>{s.independent ? 'Independent' : 'Client-owned'}</Badge>
          {s.snippetOnly && <Badge tone="warn">Snippet only</Badge>}
        </li>
      ))}
    </ol>
  );
}

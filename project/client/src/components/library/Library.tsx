import { useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronRight, Clock, List, Loader2, RefreshCw, Search, SortAsc } from 'lucide-react';
import type { AnalysisResult } from '../../types/analysis';
import type { BriefingSectionId } from '../../types/briefing';
import type { LibraryAccount, LibraryResponse } from '../../types/library';
import { apiRequest, isAbortError } from '../../lib/apiClient';
import { LETTERS, STALE_AFTER_DAYS, ageInDays, formatDate, letterOf, relativeAge } from '../../lib/library';
import { BriefingScoreBadge, Favicon } from './AccountBits';
import LibraryDetail from './LibraryDetail';

type ViewMode = 'az' | 'recent';
const VIEW_KEY = 'ts.library.view';
const RECENT_PAGE = 20;
const CONTAINER = 'max-w-4xl mx-auto px-4 sm:px-6';

interface LibraryProps {
  data: LibraryResponse | null;
  loading: boolean;
  error: string;
  onReload: () => void;
  onSelectNew: () => void;
  onReanalyze: (url: string, briefingSections: BriefingSectionId[] | null) => void;
}

function loadView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === 'recent' ? 'recent' : 'az';
  } catch {
    return 'az';
  }
}

/** Library: alle analysierten Accounts A–Z (plus „Recent“ = frühere „Past Analyses“). */
export default function Library({ data, loading, error, onReload, onSelectNew, onReanalyze }: LibraryProps) {
  const [view, setView] = useState<ViewMode>(loadView);
  const [query, setQuery] = useState('');
  const [recentCount, setRecentCount] = useState(RECENT_PAGE);
  const [selected, setSelected] = useState<AnalysisResult | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [openError, setOpenError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? accounts.filter((a) => a.name.toLowerCase().includes(q) || a.domain.includes(q)) : accounts),
    [accounts, q],
  );
  const groups = useMemo(() => {
    const map = new Map<string, LibraryAccount[]>();
    for (const a of filtered) {
      const l = letterOf(a.name);
      map.set(l, [...(map.get(l) ?? []), a]);
    }
    return LETTERS.filter((l) => map.has(l)).map((l) => ({ letter: l, accounts: map.get(l)! }));
  }, [filtered]);
  const recent = useMemo(
    () =>
      filtered
        .flatMap((account) => account.analyses.map((analysis) => ({ account, analysis })))
        .sort((a, b) => Date.parse(b.analysis.analyzedAt) - Date.parse(a.analysis.analyzedAt)),
    [filtered],
  );

  const switchView = (v: ViewMode) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // egal – dann nur für diese Sitzung
    }
  };

  const open = (id: number) => {
    if (openingId !== null) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setOpeningId(id);
    setOpenError('');
    apiRequest<AnalysisResult>(`/api/analyses/${id}`, { signal: controller.signal, headers: { 'Cache-Control': 'no-store' } })
      .then((res) => {
        if (controller.signal.aborted) return;
        const wasOpen = selected !== null;
        setSelected(res);
        if (!wasOpen) window.scrollTo({ top: 0 });
      })
      .catch((e: unknown) => {
        if (!isAbortError(e)) setOpenError('Failed to load analysis. Please try again.');
      })
      .finally(() => setOpeningId(null));
  };

  const back = () => {
    setSelected(null);
    onReload();
    window.scrollTo({ top: 0 });
  };

  if (selected) {
    const account = accounts.find((a) => a.analyses.some((x) => x.id === selected.id));
    return (
      <LibraryDetail
        analysis={selected}
        account={account}
        switchingId={openingId}
        onBack={back}
        onSelectVersion={open}
        onReanalyze={onReanalyze}
      />
    );
  }

  if (loading && !data) {
    return (
      <div className={`flex justify-center py-16 ${CONTAINER}`}>
        <div role="status" aria-live="polite" className="flex items-center gap-3 text-ts-text-secondary">
          <div className="w-5 h-5 border-2 border-ts-accent/30 border-t-ts-accent rounded-full animate-spin" />
          Loading library…
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div role="alert" className={`flex flex-col items-center gap-4 text-center py-16 text-ts-text-secondary text-sm ${CONTAINER}`}>
        {error}
        <button
          type="button"
          onClick={onReload}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-ts-border text-ts-text-primary hover:border-ts-accent/40 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          Try again
        </button>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-20 text-center ${CONTAINER}`}>
        <div className="w-16 h-16 rounded-2xl bg-ts-surface-card border border-ts-border flex items-center justify-center mb-6">
          <BookOpen className="w-7 h-7 text-ts-text-secondary/50" />
        </div>
        <h3 className="text-lg font-semibold text-ts-text-primary mb-2">The library is empty</h3>
        <p className="text-sm text-ts-text-secondary max-w-sm">
          Every analysis is stored here so colleagues can reuse it instead of running it again.
        </p>
        <button
          onClick={onSelectNew}
          className="mt-6 px-5 py-2.5 bg-gradient-to-r from-adobe-red to-adobe-red-dark text-white font-semibold rounded-xl text-sm"
        >
          Start Analyzing
        </button>
      </div>
    );
  }

  const letterSet = new Set(groups.map((g) => g.letter));
  const shownRecent = recent.slice(0, recentCount);

  return (
    <div className={`space-y-5 ${CONTAINER}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ts-text-secondary">
          {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'} · {data?.totalAnalyses ?? 0} analyses — reuse
          existing results to save time and AI costs.
        </p>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Library view" className="flex rounded-lg border border-ts-border p-0.5">
            {([
              ['az', 'A–Z', SortAsc],
              ['recent', 'Recent', List],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                aria-pressed={view === id}
                onClick={() => switchView(id)}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  view === id ? 'bg-ts-surface-light text-ts-text-primary' : 'text-ts-text-secondary hover:text-ts-text-primary'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onReload}
            title="Refresh library"
            aria-label="Refresh library"
            className="rounded-lg border border-ts-border p-1.5 text-ts-text-secondary hover:text-ts-text-primary"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 rounded-xl border border-ts-border bg-ts-surface-card px-3 py-2 focus-within:border-ts-accent-light">
        <Search className="w-4 h-4 text-ts-text-secondary" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setRecentCount(RECENT_PAGE);
          }}
          placeholder="Search accounts or domains…"
          aria-label="Search library"
          className="flex-1 bg-transparent text-sm text-ts-text-primary placeholder:text-ts-text-secondary/70 outline-none"
        />
      </label>

      {openError && (
        <p role="alert" className="rounded-xl border border-adobe-red/30 bg-adobe-red/10 px-3 py-2 text-sm text-ts-text-primary">
          {openError}
        </p>
      )}

      {filtered.length === 0 && (
        <p className="py-10 text-center text-sm text-ts-text-secondary">
          No account matches “{query}”.{' '}
          <button type="button" onClick={onSelectNew} className="text-ts-accent-light hover:text-white underline underline-offset-2">
            Analyze it now
          </button>
        </p>
      )}

      {view === 'az' && filtered.length > 0 && (
        <>
          <nav aria-label="Jump to letter" className="flex flex-wrap gap-1">
            {LETTERS.map((l) => (
              <a
                key={l}
                href={letterSet.has(l) ? `#library-letter-${l}` : undefined}
                aria-disabled={!letterSet.has(l)}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(`library-letter-${l}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-semibold ${
                  letterSet.has(l)
                    ? 'text-ts-text-primary hover:bg-ts-surface-card border border-ts-border cursor-pointer'
                    : 'text-ts-text-secondary/30 pointer-events-none'
                }`}
              >
                {l}
              </a>
            ))}
          </nav>

          {groups.map((g) => (
            <section key={g.letter} id={`library-letter-${g.letter}`} aria-label={`Accounts starting with ${g.letter}`} className="scroll-mt-24">
              <h3 className="mb-2 text-sm font-bold text-adobe-red">{g.letter}</h3>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {g.accounts.map((a) => (
                  <li key={a.key}>
                    <AccountCard account={a} opening={openingId === a.latest.id} disabled={openingId !== null} onOpen={() => open(a.latest.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      {view === 'recent' && filtered.length > 0 && (
        <>
          <ul className="grid grid-cols-1 gap-2">
            {shownRecent.map(({ account, analysis }) => (
              <li key={analysis.id}>
                <button
                  type="button"
                  onClick={() => open(analysis.id)}
                  disabled={openingId !== null}
                  aria-busy={openingId === analysis.id}
                  className="w-full flex items-center gap-3 rounded-xl border border-ts-border bg-ts-surface-card px-4 py-3 text-left hover:border-ts-accent/40 transition-colors disabled:cursor-wait group"
                >
                  <Favicon url={analysis.url} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ts-text-primary truncate">{account.name}</span>
                    <span className="flex items-center gap-1.5 text-xs text-ts-text-secondary">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {formatDate(analysis.analyzedAt)}
                    </span>
                  </span>
                  <BriefingScoreBadge briefing={analysis.briefing} />
                  {openingId === analysis.id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-ts-accent-light" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-ts-text-secondary/60 group-hover:text-ts-accent" aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
          {recent.length > shownRecent.length && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setRecentCount((c) => c + RECENT_PAGE)}
                className="px-4 py-2 text-sm font-medium text-ts-text-primary border border-ts-border rounded-lg hover:border-ts-accent/40"
              >
                Show more ({recent.length - shownRecent.length} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AccountCard({
  account, opening, disabled, onOpen,
}: { account: LibraryAccount; opening: boolean; disabled: boolean; onOpen: () => void }) {
  const stale = ageInDays(account.latest.analyzedAt) >= STALE_AFTER_DAYS;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      aria-busy={opening}
      className="w-full h-full flex items-center gap-3 rounded-2xl border border-ts-border bg-ts-surface-card p-4 text-left hover:border-ts-accent/40 transition-colors disabled:cursor-wait group"
    >
      <span className="shrink-0 w-10 h-10 rounded-xl bg-ts-surface-light border border-ts-border flex items-center justify-center overflow-hidden">
        <Favicon url={account.latest.url} size="sm" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-ts-text-primary truncate">{account.name}</span>
        {account.name !== account.domain && (
          <span className="block text-xs text-ts-text-secondary truncate">{account.domain}</span>
        )}
        <span className={`mt-1 block text-xs ${stale ? 'text-ts-warning' : 'text-ts-text-secondary'}`}>
          {account.analysisCount} {account.analysisCount === 1 ? 'analysis' : 'analyses'} · last {relativeAge(account.latest.analyzedAt)}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <BriefingScoreBadge briefing={account.briefing} />
        {opening ? (
          <Loader2 className="w-4 h-4 animate-spin text-ts-accent-light" aria-hidden="true" />
        ) : (
          <ChevronRight className="w-4 h-4 text-ts-text-secondary/60 group-hover:text-ts-accent group-hover:translate-x-0.5 transition-all" aria-hidden="true" />
        )}
      </span>
    </button>
  );
}

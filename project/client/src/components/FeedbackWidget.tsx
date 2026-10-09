import { useState, type FormEvent } from 'react';
import { CheckCircle2, LoaderCircle, MessageSquareWarning, Plus, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react';
import { apiRequest, toErrorMessage } from '../lib/apiClient';
import type { FeedbackType } from '../types/parity';

interface FeedbackWidgetProps {
  analysisId?: number;
  batchId?: number;
}

interface MissingRow {
  url: string;
  solution: string;
  category: string;
}

const TYPES: FeedbackType[] = ['Bug: Missing Solution', 'Bug: Wrong Detection', 'Bug', 'Enhancement/Feature', 'Praise', 'Other'];
const MAX_ROWS = 20;
const emptyRow = (): MissingRow => ({ url: '', solution: '', category: '' });

const inputClass =
  'w-full px-2.5 py-2 rounded-lg border border-ts-border bg-ts-surface text-ts-text-primary placeholder-ts-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-adobe-red/40 text-sm';

export default function FeedbackWidget({ analysisId, batchId }: FeedbackWidgetProps) {
  const [rated, setRated] = useState<-1 | 1 | null>(null);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>('Bug: Missing Solution');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState<MissingRow[]>([emptyRow()]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState<string | null>(null);

  const context = { ...(analysisId ? { analysisId } : {}), ...(batchId ? { batchId } : {}) };

  async function sendRating(rating: -1 | 1) {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await apiRequest('/api/feedback', {
        method: 'POST',
        body: { type: rating === 1 ? 'Praise' : 'Other', rating, ...context },
      });
      setRated(rating);
      setThanks(rating === 1 ? 'Thanks for the feedback!' : 'Thanks – tell us what went wrong?');
      if (rating === -1) setOpen(true);
    } catch (err) {
      setError(toErrorMessage(err, 'Could not send feedback'));
    } finally {
      setSending(false);
    }
  }

  function updateRow(i: number, patch: Partial<MissingRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const missingSolutions =
      type === 'Bug: Missing Solution'
        ? rows
            .filter((r) => r.solution.trim())
            .map((r) => ({ solution: r.solution.trim(), url: r.url.trim() || undefined, category: r.category.trim() || undefined }))
        : undefined;
    try {
      await apiRequest('/api/feedback', {
        method: 'POST',
        body: {
          type,
          title: title.trim() || undefined,
          description: description.trim(),
          ...(rated ? { rating: rated } : {}),
          ...(missingSolutions?.length ? { missingSolutions } : {}),
          ...context,
        },
      });
      setOpen(false);
      setTitle('');
      setDescription('');
      setRows([emptyRow()]);
      setThanks('Thanks – your report has been submitted.');
    } catch (err) {
      setError(toErrorMessage(err, 'Could not send feedback'));
    } finally {
      setSending(false);
    }
  }

  const thumbClass = (active: boolean) =>
    `p-2 rounded-lg border transition-all disabled:opacity-50 ${
      active
        ? 'border-adobe-red/60 bg-adobe-red/10 text-adobe-red'
        : 'border-ts-border bg-ts-surface-light text-ts-text-secondary hover:text-ts-text-primary hover:border-ts-accent/30'
    }`;

  return (
    <section className="rounded-xl border border-ts-border bg-ts-surface-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-ts-text-secondary">Was this result helpful?</span>
        <button type="button" aria-label="Helpful" disabled={sending || rated !== null} onClick={() => sendRating(1)} className={thumbClass(rated === 1)}>
          <ThumbsUp className="w-4 h-4" />
        </button>
        <button type="button" aria-label="Not helpful" disabled={sending || rated !== null} onClick={() => sendRating(-1)} className={thumbClass(rated === -1)}>
          <ThumbsDown className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => { setOpen(!open); setError(null); }}
          className="ml-auto flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-ts-border bg-ts-surface-light text-ts-text-secondary hover:text-ts-text-primary hover:border-ts-accent/30 transition-colors"
        >
          {open ? <X className="w-3.5 h-3.5" /> : <MessageSquareWarning className="w-3.5 h-3.5" />}
          {open ? 'Close' : 'Report issue'}
        </button>
      </div>

      {thanks && !open && (
        <p role="status" className="mt-3 flex items-center gap-2 text-xs text-ts-success">
          <CheckCircle2 className="w-4 h-4" />
          {thanks}
        </p>
      )}
      {error && !open && <p role="alert" className="mt-3 text-xs text-adobe-red">{error}</p>}

      {open && (
        <form onSubmit={handleSubmit} className="mt-4 p-3 rounded-lg border border-ts-border bg-ts-surface-light space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="fb-type" className="block text-xs font-medium text-ts-text-secondary mb-1">Type</label>
              <select id="fb-type" value={type} onChange={(e) => setType(e.target.value as FeedbackType)} className={inputClass}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="fb-title" className="block text-xs font-medium text-ts-text-secondary mb-1">Title (optional)</label>
              <input id="fb-title" type="text" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary" className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="fb-desc" className="block text-xs font-medium text-ts-text-secondary mb-1">Description</label>
            <textarea id="fb-desc" required maxLength={4000} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What did you expect, what happened?" className={inputClass} />
          </div>

          {type === 'Bug: Missing Solution' && (
            <div>
              <p className="text-xs font-medium text-ts-text-secondary mb-1">Missing solutions</p>
              <div className="space-y-2">
                {rows.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                    <input aria-label={`URL ${i + 1}`} type="text" value={row.url} onChange={(e) => updateRow(i, { url: e.target.value })} placeholder="URL (optional)" className={inputClass} />
                    <input aria-label={`Solution ${i + 1}`} type="text" maxLength={200} value={row.solution} onChange={(e) => updateRow(i, { solution: e.target.value })} placeholder="Solution, e.g. Tealium iQ" className={inputClass} />
                    <input aria-label={`Category ${i + 1}`} type="text" maxLength={100} value={row.category} onChange={(e) => updateRow(i, { category: e.target.value })} placeholder="Category (optional)" className={inputClass} />
                    <button
                      type="button"
                      aria-label={`Remove row ${i + 1}`}
                      disabled={rows.length === 1}
                      onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                      className="p-2 rounded-lg border border-ts-border text-ts-text-secondary hover:text-adobe-red disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              {rows.length < MAX_ROWS && (
                <button type="button" onClick={() => setRows((prev) => [...prev, emptyRow()])} className="mt-2 flex items-center gap-1 text-xs text-ts-accent hover:text-ts-text-primary">
                  <Plus className="w-3.5 h-3.5" /> Add row
                </button>
              )}
            </div>
          )}

          {error && <p role="alert" className="text-xs text-adobe-red whitespace-pre-line">{error}</p>}
          <button
            type="submit"
            disabled={sending}
            className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg bg-gradient-to-r from-adobe-red to-adobe-red-dark text-white font-semibold hover:from-adobe-red-dark hover:to-[#B03522] transition-all disabled:opacity-50"
          >
            {sending && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
            {sending ? 'Sending…' : 'Submit feedback'}
          </button>
        </form>
      )}
    </section>
  );
}

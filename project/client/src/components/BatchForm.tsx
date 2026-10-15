import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Plus, Trash2, Upload, Send } from 'lucide-react';
import type { AssessmentLens, BatchJob, BatchKind } from '../types/parity';
import { apiRequest, toErrorMessage } from '../lib/apiClient';
import { checkUrlInput } from '../lib/urlValidation';
import type { BatchEnrichmentOptions } from '../types/batchAccount';
import BatchSourcesPicker from './BatchSourcesPicker';

const LENSES: AssessmentLens[] = ['Brand', 'Geo', 'Journey Stage', 'Competitors', 'Other'];
const MAX_ACCOUNT_URLS = 30;
const MAX_BULK_URLS = 1000;
const APPROVAL_HINT_THRESHOLD = 50;
const WORD_START = /^[\p{L}\p{N}_]/u;

const LABEL_PLACEHOLDER: Record<AssessmentLens, string> = {
  Brand: 'Brand',
  Geo: 'Country / region',
  'Journey Stage': 'Journey stage',
  Competitors: 'Competitor',
  Other: 'Label',
};

interface CreateResponse {
  batch: BatchJob;
  warnings: string[];
}

interface BatchFormProps {
  mode: BatchKind;
  onCreated: (batch: BatchJob, warnings: string[]) => void;
}

const inputClass =
  'w-full px-3 py-2 text-sm bg-ts-surface-light border border-ts-border rounded-lg text-ts-text-primary placeholder:text-ts-text-secondary/60 focus:outline-none focus:border-ts-accent/60';
const labelClass = 'block text-xs font-medium text-ts-text-secondary mb-1';

function countBulkLines(text: string): number {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  if (lines.length > 0 && /^"?(url|urls|website|websites|domain|site|link)"?\s*([,;\t]|$)/i.test(lines[0])) {
    return lines.length - 1;
  }
  return lines.length;
}

/** Gleiche Duplikat-Logik wie der Server (batchInput.dedupeKey): ohne www., ohne Trailing Slash. */
function dedupeKey(url: string): string {
  const u = new URL(url);
  return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}${u.search}`;
}

function describeProblem(input: string): string | null {
  const c = checkUrlInput(input);
  if (c.ok) return null;
  return c.suggestion ? `${c.message} Did you mean ${c.suggestion}?` : c.message;
}

/** Vorschau der Bulk-Eingabe: ungültige Zeilen und Duplikate, die der Server überspringen würde. */
function bulkIssues(text: string): { invalid: string[]; duplicates: number } {
  const invalid: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const cell = line.split(/[\t;,]/)[0].trim().replace(/^["']|["']$/g, '');
    if (i === 0 && /^(url|urls|website|websites|domain|site|link)$/i.test(cell)) return;
    if (!cell) return;
    const c = checkUrlInput(cell);
    if (!c.ok) {
      invalid.push(`Line ${i + 1}: "${cell.slice(0, 60)}" – ${c.suggestion ? `did you mean ${c.suggestion}?` : c.message}`);
      return;
    }
    const key = dedupeKey(c.url);
    if (seen.has(key)) duplicates++;
    else seen.add(key);
  });
  return { invalid, duplicates };
}

export default function BatchForm({ mode, onCreated }: BatchFormProps) {
  const [title, setTitle] = useState('');
  const [accountName, setAccountName] = useState('');
  const [industry, setIndustry] = useState('');
  const [opportunityId, setOpportunityId] = useState('');
  const [lens, setLens] = useState<AssessmentLens>('Brand');
  const [rows, setRows] = useState<Array<{ url: string; label: string }>>([{ url: '', label: '' }]);
  const [bulkText, setBulkText] = useState('');
  const [aiAccount, setAiAccount] = useState(true);
  const [aiBulk, setAiBulk] = useState(false);
  const [sources, setSources] = useState<BatchEnrichmentOptions | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const bulkCount = useMemo(() => countBulkLines(bulkText), [bulkText]);
  const bulkCheck = useMemo(() => bulkIssues(bulkText), [bulkText]);
  const rowProblems = useMemo(() => {
    const seen = new Map<string, number>();
    return rows.map((r, idx) => {
      const value = r.url.trim();
      if (!value) return null;
      const problem = describeProblem(value);
      if (problem) return { blocking: true, text: problem };
      const check = checkUrlInput(value);
      const key = check.ok ? dedupeKey(check.url) : value;
      const first = seen.get(key);
      if (first !== undefined) return { blocking: false, text: `Duplicate of URL ${first + 1} – will be analyzed only once.` };
      seen.set(key, idx);
      return null;
    });
  }, [rows]);
  const rowsValid = rowProblems.every((p) => !p?.blocking);
  const filledRows = rows.filter((r) => r.url.trim());
  const effectiveTitle = title.trim() || (mode === 'account' ? accountName.trim() : '');
  const titleValid = WORD_START.test(effectiveTitle);
  const labelsValid = filledRows.every((r) => !r.label.trim() || WORD_START.test(r.label.trim()));
  const canSubmit =
    !submitting &&
    titleValid &&
    (mode === 'account'
      ? filledRows.length > 0 && filledRows.length <= MAX_ACCOUNT_URLS && labelsValid && rowsValid
      : bulkCount > 0 && bulkCount <= MAX_BULK_URLS && bulkCheck.invalid.length < bulkCount);

  const updateRow = (idx: number, key: 'url' | 'label', value: string) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      setError('CSV file is too large (max 2 MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setBulkText(typeof reader.result === 'string' ? reader.result : '');
      setError('');
    };
    reader.onerror = () => setError('Could not read the CSV file.');
    reader.readAsText(file);
    e.target.value = '';
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const body =
        mode === 'account'
          ? {
              kind: 'account' as const,
              title: effectiveTitle,
              lens,
              accountName: accountName.trim() || undefined,
              industry: industry.trim() || undefined,
              opportunityId: opportunityId.trim() || undefined,
              aiAnalysis: aiAccount,
              enrichments: sources ?? undefined,
              items: filledRows.map((r) => ({ url: r.url.trim(), label: r.label.trim() || undefined })),
            }
          : { kind: 'bulk' as const, title: effectiveTitle, aiAnalysis: aiBulk, enrichments: sources ?? undefined, input: bulkText };
      const res = await apiRequest<CreateResponse>('/api/batches', { method: 'POST', body });
      onCreated(res.batch, res.warnings ?? []);
      setRows([{ url: '', label: '' }]);
      setBulkText('');
      setTitle('');
    } catch (err) {
      setError(toErrorMessage(err, 'Failed to start the assessment.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-5 rounded-2xl border border-ts-border bg-ts-surface-card">
      {mode === 'account' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={labelClass} htmlFor="batch-account">Account Name</label>
              <input id="batch-account" className={inputClass} value={accountName} maxLength={255}
                onChange={(e) => setAccountName(e.target.value)} placeholder="e.g. ACME Group" />
            </div>
            <div>
              <label className={labelClass} htmlFor="batch-industry">Industry</label>
              <input id="batch-industry" className={inputClass} value={industry} maxLength={255}
                onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Retail" />
            </div>
            <div>
              <label className={labelClass} htmlFor="batch-opp">Opportunity ID</label>
              <input id="batch-opp" className={inputClass} value={opportunityId} maxLength={64}
                onChange={(e) => setOpportunityId(e.target.value)} placeholder="optional" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className={labelClass} htmlFor="batch-title">Assessment Title</label>
              <input id="batch-title" className={inputClass} value={title} maxLength={255}
                onChange={(e) => setTitle(e.target.value)} placeholder={accountName || 'Defaults to the account name'} />
            </div>
            <div>
              <label className={labelClass} htmlFor="batch-lens">Lens</label>
              <select id="batch-lens" className={inputClass} value={lens}
                onChange={(e) => setLens(e.target.value as AssessmentLens)}>
                {LENSES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className={labelClass}>Properties ({filledRows.length}/{MAX_ACCOUNT_URLS})</span>
            </div>
            <div className="space-y-2">
              {rows.map((row, idx) => (
                <div key={idx}>
                <div className="flex gap-2">
                  <input aria-label={`URL ${idx + 1}`} className={`${inputClass} flex-[2]`} value={row.url}
                    aria-invalid={rowProblems[idx]?.blocking ? true : undefined}
                    aria-describedby={rowProblems[idx] ? `batch-url-${idx}-problem` : undefined}
                    onChange={(e) => updateRow(idx, 'url', e.target.value)} placeholder="www.example.com" />
                  <input aria-label={`Label ${idx + 1}`} className={`${inputClass} flex-1`} value={row.label} maxLength={255}
                    onChange={(e) => updateRow(idx, 'label', e.target.value)} placeholder={LABEL_PLACEHOLDER[lens]} />
                  <button type="button" aria-label="Remove row" disabled={rows.length === 1}
                    onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                    className="px-2 text-ts-text-secondary hover:text-adobe-red disabled:opacity-30">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {rowProblems[idx] && (
                  <p id={`batch-url-${idx}-problem`}
                    className={`mt-1 text-xs ${rowProblems[idx]!.blocking ? 'text-adobe-red' : 'text-ts-warning'}`}>
                    {rowProblems[idx]!.text}
                  </p>
                )}
                </div>
              ))}
            </div>
            <button type="button" disabled={rows.length >= MAX_ACCOUNT_URLS}
              onClick={() => setRows((prev) => [...prev, { url: '', label: '' }])}
              className="mt-2 flex items-center gap-1.5 text-xs text-ts-accent hover:text-ts-accent-light disabled:opacity-40">
              <Plus className="w-3.5 h-3.5" /> Add URL
            </button>
            {!labelsValid && (
              <p className="mt-1 text-xs text-adobe-red">Labels must start with a letter, digit or underscore.</p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-ts-text-primary">
            <input type="checkbox" checked={aiAccount} onChange={(e) => setAiAccount(e.target.checked)} />
            Full AI analysis per URL
            <span className="text-xs text-ts-text-secondary">(slower; otherwise detection only)</span>
          </label>
        </>
      ) : (
        <>
          <div>
            <label className={labelClass} htmlFor="bulk-title">Assessment Title</label>
            <input id="bulk-title" className={inputClass} value={title} maxLength={255}
              onChange={(e) => setTitle(e.target.value)} placeholder="e.g. DACH retail landscape" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelClass} htmlFor="bulk-input">
                URLs — one per line, optional label after a comma or tab, or CSV with header <code>url,label</code>
              </label>
              <span className={`text-xs ${bulkCount > MAX_BULK_URLS ? 'text-adobe-red' : 'text-ts-text-secondary'}`}>
                {bulkCount}/{MAX_BULK_URLS}
              </span>
            </div>
            <textarea id="bulk-input" className={`${inputClass} font-mono h-48`} value={bulkText}
              onChange={(e) => setBulkText(e.target.value)} placeholder={'url,label\nwww.example.com,Brand A\nexample.de,Brand B'} />
            <div className="mt-2 flex items-center gap-3">
              <button type="button" onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-ts-text-secondary border border-ts-border rounded-lg hover:text-ts-text-primary hover:border-ts-accent/40">
                <Upload className="w-3.5 h-3.5" /> Upload CSV
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} />
              {(bulkCheck.invalid.length > 0 || bulkCheck.duplicates > 0) && (
                <span className="text-xs text-ts-warning">
                  {bulkCheck.invalid.length > 0 && `${bulkCheck.invalid.length} invalid line(s) will be skipped. `}
                  {bulkCheck.duplicates > 0 && `${bulkCheck.duplicates} duplicate(s) will be analyzed only once.`}
                </span>
              )}
              {bulkCount > APPROVAL_HINT_THRESHOLD && (
                <span className="text-xs text-ts-warning">
                  More than {APPROVAL_HINT_THRESHOLD} URLs (default threshold) require admin approval before processing.
                </span>
              )}
            </div>
          </div>
          {bulkCheck.invalid.length > 0 && (
            <div className="p-3 rounded-lg border border-ts-warning/40 bg-ts-warning/10 text-xs text-ts-warning space-y-0.5">
              {bulkCheck.invalid.slice(0, 5).map((w) => <p key={w}>{w}</p>)}
              {bulkCheck.invalid.length > 5 && <p>…and {bulkCheck.invalid.length - 5} more</p>}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-ts-text-primary">
            <input type="checkbox" checked={aiBulk} onChange={(e) => setAiBulk(e.target.checked)} />
            Full AI analysis per URL
            <span className="text-xs text-ts-text-secondary">(off = fast detection only, no LLM cost)</span>
          </label>
        </>
      )}

      <BatchSourcesPicker mode={mode} aiAnalysis={mode === 'account' ? aiAccount : aiBulk} value={sources} onChange={setSources} />

      {!titleValid && (effectiveTitle.length > 0) && (
        <p className="text-xs text-adobe-red">Title must start with a letter, digit or underscore.</p>
      )}
      {error && <p role="alert" className="text-sm text-adobe-red whitespace-pre-line">{error}</p>}

      <div className="flex justify-end">
        <button type="submit" disabled={!canSubmit}
          className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-adobe-red to-adobe-red-dark rounded-lg disabled:opacity-40 hover:from-adobe-red-dark transition-all">
          <Send className="w-4 h-4" />
          {submitting ? 'Starting…' : mode === 'account' ? 'Start Account Assessment' : 'Start Bulk Assessment'}
        </button>
      </div>
    </form>
  );
}

import { XCircle, RotateCcw, Pencil, Wand2 } from 'lucide-react';
import type { AnalysisErrorInfo } from '../hooks/useAnalysis';

/** Fehlercodes, bei denen ein erneuter Versuch mit derselben Eingabe nichts ändert. */
const INPUT_ERROR_CODES = new Set([
  'url_empty', 'url_too_long', 'multiple_urls', 'url_whitespace', 'unsupported_scheme', 'url_credentials',
  'invalid_url', 'invalid_host', 'invalid_tld', 'url_disallowed', 'domain_not_found', 'bad_request',
]);

interface AnalysisErrorProps {
  error: AnalysisErrorInfo;
  /** Zuletzt analysierte Eingabe; leer z. B. beim Öffnen einer gespeicherten Analyse. */
  url: string;
  onRetry: () => void;
  onEdit: () => void;
  onSuggestion: (url: string) => void;
}

const primaryBtn =
  'inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-adobe-red to-adobe-red-dark text-white font-semibold rounded-xl hover:from-adobe-red-dark hover:to-[#B03522] transition-all hover:shadow-glow-red hover:scale-[1.02] active:scale-[0.98]';
const secondaryBtn =
  'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-ts-border text-ts-text-primary font-semibold hover:border-ts-accent hover:bg-ts-surface-light transition-colors';

export default function AnalysisError({ error, url, onRetry, onEdit, onSuggestion }: AnalysisErrorProps) {
  const inputProblem = error.code ? INPUT_ERROR_CODES.has(error.code) : false;
  const canRetry = Boolean(url) && !inputProblem;
  const showHint = error.hint && !(error.suggestion && /^Did you mean/i.test(error.hint));

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <div className="w-full max-w-md text-center" role="alert">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-adobe-red/10 flex items-center justify-center shadow-glow-red">
          <XCircle className="w-8 h-8 text-adobe-red" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Analysis Failed</h2>
        {url && (
          <p className="text-sm text-ts-text-secondary mb-3 break-all">
            URL: <span className="font-mono text-ts-text-primary">{url}</span>
          </p>
        )}
        <p className="text-ts-text-primary whitespace-pre-line">{error.message}</p>
        {showHint && <p className="text-sm text-ts-text-secondary mt-2">{error.hint}</p>}

        {error.suggestion && (
          <button
            type="button"
            onClick={() => onSuggestion(error.suggestion!)}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-ts-accent/50 bg-ts-accent/10 text-ts-accent-light hover:text-white hover:bg-ts-accent/30 transition-colors"
          >
            <Wand2 className="w-4 h-4" aria-hidden="true" />
            Did you mean <span className="font-semibold">{error.suggestion}</span>?
          </button>
        )}

        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          {url && (
            <button type="button" onClick={onEdit} className={canRetry ? secondaryBtn : primaryBtn}>
              <Pencil className="w-4 h-4" aria-hidden="true" />
              Edit URL
            </button>
          )}
          {(canRetry || !url) && (
            <button type="button" onClick={onRetry} className={primaryBtn}>
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              {url ? 'Try Again' : 'Back'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

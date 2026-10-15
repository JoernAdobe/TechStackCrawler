import { useRef, useState, type FormEvent } from 'react';
import { Zap, Sparkles, Lightbulb, AlertCircle } from 'lucide-react';
import LetterGlitch from './LetterGlitch';
import { checkUrlInput, type UrlCheck } from '../lib/urlValidation';

interface UrlInputProps {
  onSubmit: (url: string) => void;
  disabled?: boolean;
  /** Vorbelegung, z. B. nach "Edit URL" im Fehlerzustand. */
  initialValue?: string;
}

type UrlProblem = Extract<UrlCheck, { ok: false }>;

export default function UrlInput({ onSubmit, disabled, initialValue = '' }: UrlInputProps) {
  const [url, setUrl] = useState(initialValue);
  const [problem, setProblem] = useState<UrlProblem | null>(null);
  const submittedRef = useRef(false);

  const submit = (value: string) => {
    // Schutz gegen Doppelklick/Enter-Repeat, bevor der Analyse-View übernimmt.
    if (submittedRef.current || disabled) return;
    const check = checkUrlInput(value);
    if (!check.ok) {
      setProblem(check);
      return;
    }
    setProblem(null);
    submittedRef.current = true;
    onSubmit(value.trim());
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(url);
  };

  const handleBlur = () => {
    if (!url.trim()) return;
    const check = checkUrlInput(url);
    setProblem(check.ok ? null : check);
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[50vh] px-6 overflow-hidden">
      {/* LetterGlitch – only peeks through at edges */}
      <div className="absolute inset-0 -z-20 opacity-[0.04]">
        <LetterGlitch
          glitchColors={['#1A1A1E', '#8B8FA0', '#E8503A']}
          glitchSpeed={100}
          centerVignette={true}
          outerVignette={true}
          smooth={true}
          characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/{}[]()#@!$%"
        />
      </div>
      {/* Heavy center fade keeps text area clean */}
      <div
        className="absolute inset-0 -z-[15] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(10,10,15,0.97) 25%, rgba(10,10,15,0.7) 60%, transparent 100%)',
        }}
      />

      {/* Floating gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-ts-accent/10 blur-[100px] animate-float -z-10" />
      <div className="absolute bottom-1/4 right-1/4 w-48 h-48 rounded-full bg-adobe-red/10 blur-[80px] animate-float-delayed -z-10" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-ts-accent/5 blur-[120px] -z-10" />

      {/* Grid background */}
      <div
        className="absolute inset-0 -z-10 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgb(255 255 255 / 0.5) 1px, transparent 1px),
            linear-gradient(to bottom, rgb(255 255 255 / 0.5) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(139,143,160,0.04) 0%, transparent 70%)',
        }}
      />

      {/* Hero section — plain text with CSS animations, no SplitText */}
      <div className="text-center mb-12 max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
        <h2 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-white via-white/90 to-ts-text-secondary bg-clip-text text-transparent leading-tight">
          Analyze Any Website&apos;s
          <br />
          Tech Stack
        </h2>
        <p className="text-ts-text-secondary text-base sm:text-lg leading-relaxed mt-6">
          Enter a URL to discover the technology stack, identify challenges, and
          uncover Adobe product opportunities.
        </p>
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150 fill-mode-both">
        <div className="relative group">
          <div className="relative flex items-center bg-ts-surface-card rounded-2xl border border-ts-border group-focus-within:border-ts-accent-light transition-colors duration-300 p-1.5 sm:p-2">
            <div className="hidden sm:block pl-4 pr-2 text-ts-text-secondary">
              <svg
                aria-hidden="true"
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                />
              </svg>
            </div>
            <input
              type="text"
              inputMode="url"
              aria-label="Website URL to analyze"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (problem) setProblem(null);
              }}
              onBlur={handleBlur}
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? 'url-input-error' : undefined}
              placeholder="e.g. adobe.com"
              className="flex-1 min-w-0 bg-transparent text-ts-text-primary placeholder:text-ts-text-secondary/70 text-base sm:text-lg py-3 px-2 outline-none"
              disabled={disabled}
              autoFocus
            />
            <button
              type="submit"
              disabled={disabled || !url.trim()}
              className="relative shrink-0 flex items-center gap-2 px-4 sm:px-6 py-3 bg-gradient-to-r from-adobe-red to-adobe-red-dark text-white font-semibold rounded-xl hover:from-adobe-red-dark hover:to-[#B03522] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-200 whitespace-nowrap shadow-glow-red hover:shadow-[0_0_30px_rgba(232,80,58,0.25)]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Analyze
            </button>
          </div>
        </div>
        {problem && (
          <div
            id="url-input-error"
            role="alert"
            className="mt-3 flex items-start gap-2 px-4 py-3 rounded-xl border border-adobe-red/40 bg-adobe-red/10 text-sm text-left"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-adobe-red" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-ts-text-primary">{problem.message}</p>
              {problem.suggestion ? (
                <button
                  type="button"
                  onClick={() => {
                    setUrl(problem.suggestion!);
                    submit(problem.suggestion!);
                  }}
                  className="mt-1 text-ts-accent-light hover:text-white underline underline-offset-2"
                >
                  Did you mean {problem.suggestion}?
                </button>
              ) : (
                problem.hint && <p className="mt-0.5 text-ts-text-secondary">{problem.hint}</p>
              )}
            </div>
          </div>
        )}
      </form>

      {/* Example URLs */}
      <div className="mt-6 flex flex-wrap gap-2 justify-center animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300 fill-mode-both">
        <span className="text-sm text-ts-text-secondary self-center">Try:</span>
        {['nike.com', 'bmw.com', 'airbnb.com', 'shopify.com'].map(
          (example) => (
            <button
              key={example}
              onClick={() => {
                setUrl(example);
                setProblem(null);
              }}
              className="text-sm text-ts-accent-light hover:text-white hover:bg-ts-accent/30 bg-ts-accent/10 px-4 py-2 rounded-full transition-all duration-200 hover:scale-105 active:scale-100 border border-ts-border/50 hover:border-ts-accent/50 hover:shadow-glow-accent"
              disabled={disabled}
            >
              {example}
            </button>
          ),
        )}
      </div>

      {/* Feature highlights */}
      <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500 fill-mode-both">
        {[
          { icon: Zap, iconClass: 'text-ts-accent', bgClass: 'bg-ts-accent/20', title: 'Instant Detection', desc: 'Detection in seconds' },
          { icon: Sparkles, iconClass: 'text-ts-accent', bgClass: 'bg-ts-accent/20', title: 'AI-Powered', desc: 'Claude analyzes the stack' },
          { icon: Lightbulb, iconClass: 'text-adobe-red', bgClass: 'bg-adobe-red/20', title: 'Adobe Opportunities', desc: 'Use case recommendations' },
        ].map(({ icon: Icon, iconClass, bgClass, title, desc }) => (
          <div
            key={title}
            className="group flex items-start gap-3 p-4 rounded-xl bg-ts-surface-card border border-ts-border hover:border-ts-accent/30 transition-all duration-300 hover:shadow-glow-accent"
          >
            {/* Klassen bewusst statisch: Tailwind scannt den Quelltext, dynamisch
                zusammengesetzte Namen wie `bg-${color}` würden nie generiert. */}
            <div className={`shrink-0 w-10 h-10 rounded-lg ${bgClass} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
              <Icon className={`w-5 h-5 ${iconClass}`} strokeWidth={2} />
            </div>
            <div>
              <h3 className="font-semibold text-ts-text-primary text-sm">{title}</h3>
              <p className="text-ts-text-secondary text-xs mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { Zap, Sparkles, Lightbulb } from 'lucide-react';
import LetterGlitch from './LetterGlitch';

interface UrlInputProps {
  onSubmit: (url: string) => void;
  disabled?: boolean;
}

export default function UrlInput({ onSubmit, disabled }: UrlInputProps) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (trimmed) {
      onSubmit(trimmed);
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[50vh] px-6 overflow-hidden">
      {/* LetterGlitch – only peeks through at edges */}
      <div className="absolute inset-0 -z-20 opacity-[0.04]">
        <LetterGlitch
          glitchColors={['#1a1a2e', '#6366f1', '#EB1000']}
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
          background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.06) 0%, transparent 70%)',
        }}
      />

      {/* Hero section — plain text with CSS animations, no SplitText */}
      <div className="text-center mb-12 max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
        <h2 className="text-5xl font-bold bg-gradient-to-r from-white via-white/90 to-ts-text-secondary bg-clip-text text-transparent leading-tight">
          Analyze Any Website&apos;s
          <br />
          Tech Stack
        </h2>
        <p className="text-ts-text-secondary text-lg leading-relaxed mt-6">
          Enter a URL to discover the technology stack, identify challenges, and
          uncover Adobe product opportunities.
        </p>
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150 fill-mode-both">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-adobe-red via-ts-accent to-adobe-red rounded-2xl opacity-30 group-hover:opacity-60 group-focus-within:opacity-60 blur transition-opacity duration-500" />
          <div className="relative flex items-center bg-ts-surface-card rounded-2xl border border-ts-border p-2">
            <div className="pl-4 pr-2 text-ts-text-secondary">
              <svg
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
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter website URL (e.g., adobe.com)"
              className="flex-1 bg-transparent text-ts-text-primary placeholder-text-secondary/50 text-lg py-3 px-2 outline-none"
              disabled={disabled}
              autoFocus
            />
            <button
              type="submit"
              disabled={disabled || !url.trim()}
              className="relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-adobe-red to-red-700 text-white font-semibold rounded-xl hover:from-adobe-red-dark hover:to-red-800 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-200 whitespace-nowrap shadow-glow-red hover:shadow-[0_0_30px_rgba(235,16,0,0.3)]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Analyze
            </button>
          </div>
        </div>
      </form>

      {/* Example URLs */}
      <div className="mt-6 flex flex-wrap gap-2 justify-center animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300 fill-mode-both">
        <span className="text-sm text-ts-text-secondary self-center">Try:</span>
        {['nike.com', 'bmw.com', 'airbnb.com', 'shopify.com'].map(
          (example) => (
            <button
              key={example}
              onClick={() => { setUrl(example); }}
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
          { icon: Zap, color: 'ts-accent', title: 'Instant Detection', desc: 'Erkennung in Sekunden' },
          { icon: Sparkles, color: 'ts-accent', title: 'AI-Powered', desc: 'Claude analysiert den Stack' },
          { icon: Lightbulb, color: 'adobe-red', title: 'Adobe Opportunities', desc: 'Use-Case-Empfehlungen' },
        ].map(({ icon: Icon, color, title, desc }) => (
          <div
            key={title}
            className="group flex items-start gap-3 p-4 rounded-xl bg-ts-surface-card border border-ts-border hover:border-ts-accent/30 transition-all duration-300 hover:shadow-glow-accent"
          >
            <div className={`shrink-0 w-10 h-10 rounded-lg bg-${color}/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
              <Icon className={`w-5 h-5 text-${color}`} strokeWidth={2} />
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

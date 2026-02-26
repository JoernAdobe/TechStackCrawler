import { useState, type FormEvent } from 'react';

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
    <div className="flex flex-col items-center justify-center min-h-[40vh] px-6">
      {/* Hero section */}
      <div className="text-center mb-12 max-w-2xl">
        <h2 className="text-5xl font-bold mb-4 bg-gradient-to-r from-white via-text-primary to-text-secondary bg-clip-text text-transparent">
          Analyze Any Website's
          <br />
          Tech Stack
        </h2>
        <p className="text-ts-text-secondary text-lg">
          Enter a URL to discover the technology stack, identify challenges, and
          uncover Adobe product opportunities.
        </p>
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="w-full max-w-2xl">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-adobe-red via-ts-accent to-adobe-red rounded-2xl opacity-30 group-hover:opacity-50 blur transition-opacity duration-500" />
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
              className="px-6 py-3 bg-gradient-to-r from-adobe-red to-red-700 text-white font-semibold rounded-xl hover:from-adobe-red-dark hover:to-red-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 whitespace-nowrap"
            >
              Analyze
            </button>
          </div>
        </div>
      </form>

      {/* Example URLs */}
      <div className="mt-6 flex flex-wrap gap-2 justify-center">
        <span className="text-xs text-ts-text-secondary">Try:</span>
        {['nike.com', 'bmw.com', 'airbnb.com', 'shopify.com'].map(
          (example) => (
            <button
              key={example}
              onClick={() => { setUrl(example); }}
              className="text-xs text-ts-accent-light hover:text-ts-accent bg-ts-accent/10 px-3 py-1 rounded-full transition-colors"
              disabled={disabled}
            >
              {example}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

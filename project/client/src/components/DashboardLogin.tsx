import { useState, type FormEvent } from 'react';

interface Props {
  onLogin: (token: string) => void;
}

export default function DashboardLogin({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      onLogin(data.token);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ts-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-adobe-red to-red-700 flex items-center justify-center">
            <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.966 22.624l-1.69-4.281H8.122l3.892-9.144 5.662 13.425zM8.884 1.376H0v21.248zm6.232 0L24 22.624V1.376z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-ts-text-primary">Usage Dashboard</h1>
          <p className="text-sm text-ts-text-secondary mt-1">TechStack Analyzer — Management View</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="dash-email" className="block text-xs font-medium text-ts-text-secondary mb-1.5">
              Email
            </label>
            <input
              id="dash-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-ts-border bg-ts-surface-light text-ts-text-primary placeholder-ts-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-adobe-red/40 focus:border-adobe-red transition-colors text-sm"
              placeholder="you@adobe.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label htmlFor="dash-pw" className="block text-xs font-medium text-ts-text-secondary mb-1.5">
              Password
            </label>
            <input
              id="dash-pw"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-ts-border bg-ts-surface-light text-ts-text-primary placeholder-ts-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-adobe-red/40 focus:border-adobe-red transition-colors text-sm"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-adobe-red to-red-700 text-white font-semibold text-sm hover:from-adobe-red-dark hover:to-red-800 transition-all disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-ts-text-secondary mt-6">
          <a href="#/" className="hover:text-ts-accent transition-colors">
            ← Back to Analyzer
          </a>
        </p>
      </div>
    </div>
  );
}

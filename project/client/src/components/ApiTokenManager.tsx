import { useState, useEffect, useCallback, type FormEvent } from 'react';

interface ApiToken {
  id: number;
  name: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  isActive: boolean;
}

interface Props {
  token: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ApiTokenManager({ token }: Props) {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newExpiry, setNewExpiry] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const fetchTokens = useCallback(async () => {
    try {
      const res = await fetch('/api/tokens', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setTokens(await res.json());
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newName.trim(),
          expiresAt: newExpiry || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create token');
        return;
      }
      const data = await res.json();
      setCreatedToken(data.token);
      setNewName('');
      setNewExpiry('');
      await fetchTokens();
    } catch {
      setError('Network error');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: number) {
    try {
      await fetch(`/api/tokens/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchTokens();
    } catch {
      // silent
    }
  }

  function handleCopy() {
    if (createdToken) {
      navigator.clipboard.writeText(createdToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const activeTokens = tokens.filter((t) => t.isActive);
  const revokedTokens = tokens.filter((t) => !t.isActive);

  return (
    <section className="rounded-xl border border-ts-border bg-ts-surface-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-ts-text-secondary uppercase tracking-wider">
          MCP API Tokens
        </h3>
        <button
          onClick={() => { setShowCreate(!showCreate); setCreatedToken(null); setError(''); }}
          className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-adobe-red to-adobe-red-dark text-white font-semibold hover:from-adobe-red-dark hover:to-[#B03522] transition-all"
        >
          {showCreate ? 'Cancel' : '+ New Token'}
        </button>
      </div>

      {/* Token created banner */}
      {createdToken && (
        <div className="mb-4 p-3 rounded-lg border border-ts-success/30 bg-ts-success/5">
          <p className="text-xs text-ts-success font-semibold mb-1">Token created — copy it now, it won't be shown again!</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-ts-surface-light p-2 rounded font-mono text-ts-text-primary break-all select-all">
              {createdToken}
            </code>
            <button
              onClick={handleCopy}
              className="shrink-0 text-xs px-3 py-2 rounded-lg border border-ts-border bg-ts-surface-light hover:bg-ts-surface-hover transition-colors text-ts-text-secondary hover:text-ts-text-primary"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && !createdToken && (
        <form onSubmit={handleCreate} className="mb-4 p-3 rounded-lg border border-ts-border bg-ts-surface-light">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-ts-text-secondary mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Claude Desktop"
                required
                className="w-full px-2.5 py-2 rounded-lg border border-ts-border bg-ts-surface text-ts-text-primary placeholder-ts-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-adobe-red/40 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ts-text-secondary mb-1">Expires (optional)</label>
              <input
                type="date"
                value={newExpiry}
                onChange={(e) => setNewExpiry(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border border-ts-border bg-ts-surface text-ts-text-primary focus:outline-none focus:ring-2 focus:ring-adobe-red/40 text-sm"
              />
            </div>
          </div>
          {error && <p className="text-adobe-red text-xs mb-2">{error}</p>}
          <button
            type="submit"
            disabled={creating}
            className="text-xs px-4 py-2 rounded-lg bg-gradient-to-r from-adobe-red to-adobe-red-dark text-white font-semibold hover:from-adobe-red-dark hover:to-[#B03522] transition-all disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create Token'}
          </button>
        </form>
      )}

      {/* Tokens table */}
      {loading ? (
        <p className="text-ts-text-secondary text-sm py-4 text-center">Loading tokens…</p>
      ) : tokens.length === 0 ? (
        <p className="text-ts-text-secondary text-sm py-4 text-center">
          No API tokens yet. Create one to allow agents to access the MCP endpoint.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ts-border/50 text-ts-text-secondary">
                <th className="text-left py-2 pr-3 font-medium">Name</th>
                <th className="text-left py-2 pr-3 font-medium">Created</th>
                <th className="text-left py-2 pr-3 font-medium">Expires</th>
                <th className="text-left py-2 pr-3 font-medium">Last Used</th>
                <th className="text-left py-2 pr-3 font-medium">Status</th>
                <th className="text-right py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {activeTokens.map((t) => (
                <tr key={t.id} className="border-b border-ts-border/30">
                  <td className="py-2 pr-3 text-ts-text-primary font-medium">{t.name}</td>
                  <td className="py-2 pr-3 text-ts-text-secondary">{formatDate(t.createdAt)}</td>
                  <td className="py-2 pr-3 text-ts-text-secondary">{formatDate(t.expiresAt)}</td>
                  <td className="py-2 pr-3 text-ts-text-secondary">{formatDate(t.lastUsedAt)}</td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-ts-success/10 text-ts-success text-[10px] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-ts-success" />
                      Active
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => handleRevoke(t.id)}
                      className="text-adobe-red hover:text-adobe-red-dark transition-colors font-medium"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
              {revokedTokens.map((t) => (
                <tr key={t.id} className="border-b border-ts-border/30 opacity-50">
                  <td className="py-2 pr-3 text-ts-text-secondary">{t.name}</td>
                  <td className="py-2 pr-3 text-ts-text-secondary">{formatDate(t.createdAt)}</td>
                  <td className="py-2 pr-3 text-ts-text-secondary">{formatDate(t.expiresAt)}</td>
                  <td className="py-2 pr-3 text-ts-text-secondary">{formatDate(t.lastUsedAt)}</td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-ts-text-secondary/10 text-ts-text-secondary text-[10px] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-ts-text-secondary" />
                      Revoked
                    </span>
                  </td>
                  <td className="py-2 text-right text-ts-text-secondary">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MCP endpoint info */}
      <div className="mt-4 p-3 rounded-lg bg-ts-surface-light border border-ts-border/50">
        <p className="text-[11px] text-ts-text-secondary">
          <span className="font-semibold text-ts-text-primary">MCP Endpoint:</span>{' '}
          <code className="bg-ts-surface px-1.5 py-0.5 rounded text-ts-accent font-mono">
            {window.location.origin}/mcp
          </code>
          {' '}— Use with header{' '}
          <code className="bg-ts-surface px-1.5 py-0.5 rounded font-mono">
            Authorization: Bearer &lt;token&gt;
          </code>
        </p>
      </div>
    </section>
  );
}

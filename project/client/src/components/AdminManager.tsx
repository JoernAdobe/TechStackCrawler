import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
import { ApiError, apiRequest, isAbortError, toErrorMessage } from '../lib/apiClient';

interface AdminEntry {
  email: string;
  fixed: boolean;
  addedBy: string | null;
  addedAt: string | null;
  isSelf: boolean;
}

interface Props {
  onUnauthorized?: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Pflege der Admins für diesen View (Login nur via Okta, Zugriff per E-Mail). */
export default function AdminManager({ onUnauthorized }: Props) {
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const onUnauthorizedRef = useRef(onUnauthorized);
  onUnauthorizedRef.current = onUnauthorized;

  const handleError = useCallback((err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.status === 401) {
      onUnauthorizedRef.current?.();
      return;
    }
    setError(toErrorMessage(err, fallback));
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchAdmins = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setAdmins(await apiRequest<AdminEntry[]>('/api/dashboard/admins', { signal: controller.signal }));
    } catch (err) {
      if (isAbortError(err)) return;
      handleError(err, 'Failed to load admins');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }, [handleError]);

  useEffect(() => {
    void fetchAdmins();
  }, [fetchAdmins]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const email = newEmail.trim();
    if (!email) return;
    setSaving(true);
    setError('');
    try {
      await apiRequest('/api/dashboard/admins', { method: 'POST', body: { email } });
      setNewEmail('');
      await fetchAdmins();
    } catch (err) {
      handleError(err, 'Failed to add admin');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(email: string) {
    if (!window.confirm(`Remove admin access for ${email}?`)) return;
    setError('');
    try {
      await apiRequest(`/api/dashboard/admins/${encodeURIComponent(email)}`, { method: 'DELETE' });
      await fetchAdmins();
    } catch (err) {
      handleError(err, 'Failed to remove admin');
    }
  }

  return (
    <section className="rounded-xl border border-ts-border bg-ts-surface-card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-ts-text-secondary uppercase tracking-wider">Admins</h3>
        <p className="text-xs text-ts-text-secondary mt-1">
          Sign-in is Okta only. These Adobe emails get access to this admin view.
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2 mb-4">
        <label htmlFor="admin-email" className="sr-only">Admin email</label>
        <input
          id="admin-email"
          type="email"
          required
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="colleague@adobe.com"
          className="flex-1 px-2.5 py-2 rounded-lg border border-ts-border bg-ts-surface text-ts-text-primary placeholder-ts-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-adobe-red/40 text-sm"
        />
        <button
          type="submit"
          disabled={saving}
          className="text-xs px-4 py-2 rounded-lg bg-gradient-to-r from-adobe-red to-adobe-red-dark text-white font-semibold hover:from-adobe-red-dark hover:to-[#B03522] transition-all disabled:opacity-50"
        >
          {saving ? 'Adding…' : '+ Add Admin'}
        </button>
      </form>
      {error && <p role="alert" className="text-adobe-red text-xs mb-3">{error}</p>}

      {loading ? (
        <p className="text-ts-text-secondary text-sm py-4 text-center">Loading admins…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ts-border/50 text-ts-text-secondary">
                <th className="text-left py-2 pr-3 font-medium">Email</th>
                <th className="text-left py-2 pr-3 font-medium">Added by</th>
                <th className="text-left py-2 pr-3 font-medium">Added</th>
                <th className="text-right py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.email} className="border-b border-ts-border/30">
                  <td className="py-2 pr-3 text-ts-text-primary font-medium">
                    {a.email}
                    {a.isSelf && <span className="ml-2 text-[10px] text-ts-text-secondary">(you)</span>}
                  </td>
                  <td className="py-2 pr-3 text-ts-text-secondary">{a.addedBy ?? '—'}</td>
                  <td className="py-2 pr-3 text-ts-text-secondary">{formatDate(a.addedAt)}</td>
                  <td className="py-2 text-right">
                    {a.fixed ? (
                      <span
                        title="Owner / ADMIN_EMAILS — managed via server config"
                        className="inline-flex px-1.5 py-0.5 rounded-full bg-ts-text-secondary/10 text-ts-text-secondary text-[10px] font-semibold"
                      >
                        Fixed
                      </span>
                    ) : a.isSelf ? (
                      <span className="text-ts-text-secondary">—</span>
                    ) : (
                      <button
                        onClick={() => handleRemove(a.email)}
                        className="text-adobe-red hover:text-adobe-red-dark transition-colors font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

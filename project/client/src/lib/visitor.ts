/**
 * Anonyme, first-party Besucher-ID (localStorage, Cookie nur als Spiegel für
 * Downloads/Links). Keine personenbezogenen Daten – nur zum Zählen von Nutzern
 * und Wiederkehrern im Management-Dashboard.
 */
const STORAGE_KEY = 'ts_vid';
const SESSION_KEY = 'ts_visit_sent';
const ID_RE = /^[a-f0-9]{32}$/;

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

let cached: string | null = null;

export function getVisitorId(): string {
  if (cached) return cached;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ID_RE.test(stored)) return (cached = stored);
    const id = randomId();
    localStorage.setItem(STORAGE_KEY, id);
    return (cached = id);
  } catch {
    return (cached = randomId());
  }
}

export function trackUsage(event: string, analysisId?: number): void {
  try {
    const body = new Blob([JSON.stringify({ event, analysisId, visitorId: getVisitorId() })], { type: 'application/json' });
    if (navigator.sendBeacon?.('/api/usage', body)) return;
    void fetch('/api/usage', { method: 'POST', body, keepalive: true, credentials: 'same-origin' }).catch(() => undefined);
  } catch {
    // Tracking darf nie stören
  }
}

/** Einmal pro Browser-Tab-Sitzung einen Besuch melden. */
export function trackVisit(): void {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // ohne sessionStorage: trotzdem melden
  }
  trackUsage('visit');
}

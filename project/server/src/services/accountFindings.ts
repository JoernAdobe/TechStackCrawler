/**
 * Aggregierte Datenschutz-/Technik-Findings über alle Domains eines Accounts.
 * Quellen: ObservePoint-Insights, Pre-Consent-Erkennungen, Scan-Warnungen, Lighthouse-Schwellen, OP-Konflikte.
 */
import type { BatchItem } from '../types/parity.js';
import type { AccountFinding } from '../types/batchAccount.js';

const SEVERITY_RANK: Record<AccountFinding['severity'], number> = { high: 0, medium: 1, low: 2 };
const MAX_FINDINGS = 40;

type Draft = Omit<AccountFinding, 'domains'> & { domains: Set<string> };

export function aggregateFindings(items: BatchItem[], hosts: string[]): AccountFinding[] {
  const map = new Map<string, Draft>();
  const add = (f: Omit<AccountFinding, 'domains'>, host: string) => {
    const existing = map.get(f.key);
    if (existing) {
      existing.domains.add(host);
      if (SEVERITY_RANK[f.severity] < SEVERITY_RANK[existing.severity]) existing.severity = f.severity;
      return;
    }
    map.set(f.key, { ...f, domains: new Set([host]) });
  };

  items.forEach((item, i) => {
    const host = hosts[i];
    const e = item.enrichments ?? {};

    for (const f of e.observepoint?.findings ?? []) {
      add(
        {
          key: `op:${f.id}`,
          title: f.title,
          kind: /consent|cookie|privacy|gdpr|non-eu|pii/i.test(`${f.type} ${f.title}`) ? 'privacy' : 'technical',
          severity: f.severity,
          source: 'observepoint',
          ...(f.evidence ? { detail: f.evidence } : {}),
        },
        host,
      );
    }
    for (const block of e.observepoint?.conflicts ?? []) {
      add(
        {
          key: `conflict:${block}`,
          title: `TechStack and ObservePoint disagree on ${block}`,
          kind: 'quality',
          severity: 'low',
          source: 'observepoint',
          detail: 'Different solutions seen by the crawler and by ObservePoint – verify before the customer conversation.',
        },
        host,
      );
    }

    const preConsent = (item.detections ?? []).filter((d) => d.preConsent).map((d) => d.name);
    for (const name of preConsent) {
      add(
        {
          key: `preconsent:${name}`,
          title: `${name} fires before consent`,
          kind: 'privacy',
          severity: 'high',
          source: 'consent',
          detail: 'Detected in the initial page load before any consent interaction (GDPR/TTDSG risk).',
        },
        host,
      );
    }

    for (const w of e.scanWarnings ?? []) {
      add(
        {
          key: `scan:${w.code}`,
          title: w.message.slice(0, 140),
          kind: 'technical',
          severity: w.severity === 'error' ? 'high' : w.severity === 'warning' ? 'medium' : 'low',
          source: 'scan',
        },
        host,
      );
    }

    const l = e.lighthouse;
    if (l) {
      if (l.mobilePerformance !== null && l.mobilePerformance < 50) {
        add(
          { key: 'lh:mobile-perf', title: 'Poor mobile performance (Lighthouse < 50)', kind: 'performance', severity: 'medium', source: 'lighthouse' },
          host,
        );
      }
      if (l.lcpMs !== undefined && l.lcpMs > 4000) {
        add(
          { key: 'lh:lcp', title: 'Largest Contentful Paint above 4 s', kind: 'performance', severity: 'medium', source: 'lighthouse' },
          host,
        );
      }
      if (l.cls !== undefined && l.cls > 0.25) {
        add(
          { key: 'lh:cls', title: 'Layout shift (CLS) above 0.25', kind: 'performance', severity: 'low', source: 'lighthouse' },
          host,
        );
      }
    }
  });

  return [...map.values()]
    .map((d) => ({ ...d, domains: [...d.domains] }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        b.domains.length - a.domains.length ||
        a.title.localeCompare(b.title),
    )
    .slice(0, MAX_FINDINGS);
}

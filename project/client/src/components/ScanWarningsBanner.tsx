import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import type { ScanWarning } from '../types/analysis';

const STYLES: Record<ScanWarning['severity'], { box: string; icon: string; Icon: typeof Info }> = {
  error: { box: 'border-red-500/40 bg-red-500/10', icon: 'text-red-500', Icon: AlertOctagon },
  warning: { box: 'border-amber-500/40 bg-amber-500/10', icon: 'text-amber-500', Icon: AlertTriangle },
  info: { box: 'border-sky-500/40 bg-sky-500/10', icon: 'text-sky-500', Icon: Info },
};
const ORDER: Record<ScanWarning['severity'], number> = { error: 0, warning: 1, info: 2 };

/** Zeigt Qualitätswarnungen eines Scans (Fehlerseite, Bot-Wall, KI-Ausfall …) oberhalb der Ergebnisse. */
export default function ScanWarningsBanner({ warnings }: { warnings?: ScanWarning[] | null }) {
  const list = (Array.isArray(warnings) ? warnings : [])
    .filter((w): w is ScanWarning => !!w && typeof w.message === 'string')
    .map((w) => ({ ...w, severity: STYLES[w.severity] ? w.severity : 'warning' as const }))
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  if (list.length === 0) return null;

  return (
    <section aria-label="Scan warnings" className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-2">
      {list.map((w, i) => {
        const { box, icon, Icon } = STYLES[w.severity];
        return (
          <div
            key={`${w.code}-${i}`}
            role={w.severity === 'info' ? 'status' : 'alert'}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm text-ts-text-primary ${box}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${icon}`} aria-hidden="true" />
            <span>{w.message}</span>
          </div>
        );
      })}
    </section>
  );
}

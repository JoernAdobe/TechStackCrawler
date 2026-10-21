import { Info } from 'lucide-react';

/** Gelber Hinweis aus dem Mock: Quellen vor dem Kundengespräch prüfen. */
export default function ReviewSourcesNote({ className = '' }: { className?: string }) {
  return (
    <p
      className={`flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-100 ${className}`}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
      <span>All sources are provided in the report, please review them before talking to clients.</span>
    </p>
  );
}

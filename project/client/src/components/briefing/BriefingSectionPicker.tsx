import { useId } from 'react';
import { Check, Lock, Minus } from 'lucide-react';
import {
  BRIEFING_LOCKED_SECTION,
  BRIEFING_SECTIONS,
  type BriefingSectionId,
} from '../../types/briefing';
import { ALL_SECTIONS, normalizeSections } from './meta';
import SectionIcon from './SectionIcon';

export interface BriefingSectionPickerProps {
  value: BriefingSectionId[];
  onChange: (v: BriefingSectionId[]) => void;
  compact?: boolean;
  disabled?: boolean;
}

function Box({ checked, mixed, locked }: { checked: boolean; mixed?: boolean; locked?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
        checked || mixed
          ? locked
            ? 'border-adobe-red/50 bg-adobe-red/50 text-white/80'
            : 'border-adobe-red bg-adobe-red text-white'
          : 'border-ts-text-secondary/60 bg-transparent'
      }`}
    >
      {mixed ? <Minus className="h-3 w-3" strokeWidth={3} /> : checked && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
  );
}

/** Auswahl der Report-Abschnitte; „Adobe Opportunity“ (s14) ist immer aktiv und gesperrt. */
export function BriefingSectionPicker({ value, onChange, compact, disabled }: BriefingSectionPickerProps) {
  const uid = useId();
  const selected = new Set(normalizeSections(value));
  const allSelected = selected.size === ALL_SECTIONS.length;
  const someSelected = !allSelected && selected.size > 1;

  const toggle = (id: BriefingSectionId) => {
    if (id === BRIEFING_LOCKED_SECTION || disabled) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(normalizeSections([...next]));
  };

  const toggleAll = () => {
    if (disabled) return;
    onChange(allSelected ? [BRIEFING_LOCKED_SECTION] : ALL_SECTIONS);
  };

  const rowPad = compact ? 'px-2.5 py-2' : 'px-3 py-2.5';

  return (
    <div className={disabled ? 'opacity-60' : undefined}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id={`${uid}-title`} className={`font-semibold text-ts-text-primary ${compact ? 'text-sm' : 'text-base'}`}>
            Report Sections
          </h3>
          {!compact && (
            <p className="mt-0.5 text-sm text-ts-text-secondary">
              Select the sections to include in your report. All sections are selected by default.
            </p>
          )}
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-ts-text-primary has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-adobe-red">
          <input
            type="checkbox"
            className="sr-only"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={toggleAll}
            disabled={disabled}
          />
          <Box checked={allSelected} mixed={someSelected} />
          Select all
        </label>
      </div>

      <ul
        aria-labelledby={`${uid}-title`}
        className={`mt-3 grid grid-cols-1 sm:grid-cols-2 ${compact ? 'gap-1.5' : 'gap-2'}`}
      >
        {BRIEFING_SECTIONS.map((meta) => {
          const locked = meta.id === BRIEFING_LOCKED_SECTION;
          const checked = selected.has(meta.id);
          return (
            <li key={meta.id}>
              <label
                title={locked ? 'Always included' : undefined}
                className={`flex items-center gap-3 rounded-lg border ${rowPad} text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-adobe-red ${
                  locked
                    ? 'cursor-not-allowed border-ts-border/60 bg-ts-surface-light/40 text-ts-text-secondary'
                    : checked
                      ? 'cursor-pointer border-ts-border bg-ts-surface-light text-ts-text-primary hover:border-ts-accent/50'
                      : 'cursor-pointer border-ts-border/60 bg-transparent text-ts-text-secondary hover:border-ts-accent/40 hover:text-ts-text-primary'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => toggle(meta.id)}
                  disabled={disabled || locked}
                  aria-describedby={locked ? `${uid}-locked` : undefined}
                />
                <Box checked={checked} locked={locked} />
                <SectionIcon meta={meta} className="h-4 w-4 shrink-0 text-ts-text-secondary" />
                <span className="min-w-0 flex-1 leading-snug">{meta.title}</span>
                {locked && <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              </label>
            </li>
          );
        })}
      </ul>
      <p id={`${uid}-locked`} className="sr-only">
        Adobe Opportunity is always included.
      </p>
    </div>
  );
}

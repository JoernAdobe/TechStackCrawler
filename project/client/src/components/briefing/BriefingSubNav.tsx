import { useEffect, useRef, useState } from 'react';
import type { BriefingResult, BriefingSectionId } from '../../types/briefing';
import {
  ADOBE_OPPORTUNITY_SECTION,
  BRIEFING_SUBNAV_LABEL,
  BRIEFING_SUMMARY_ANCHOR,
  MERGED_OPPORTUNITY_ANCHOR,
  stickyChromeBottom,
} from './briefingStore';
import { prefersReducedMotion, sectionAnchor } from './meta';

interface BriefingSubNavProps {
  result: BriefingResult;
  onSummary: () => void;
  onSection: (id: BriefingSectionId) => void;
}

/**
 * Zweite, sticky Navigationsleiste mit den Pre-Briefing-Unterabschnitten.
 * Klebt unter der Haupt-Sektionsleiste, solange das Pre-Briefing sichtbar ist.
 */
export default function BriefingSubNav({ result, onSummary, onSection }: BriefingSubNavProps) {
  const [top, setTop] = useState(0);
  const [active, setActive] = useState<string>(BRIEFING_SUMMARY_ANCHOR);
  const navRef = useRef<HTMLElement>(null);
  const sections = result.sections.filter((s) => s.status !== 'skipped');

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const header = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
        const mainNav = document.querySelector('nav[aria-label="Result sections"]') as HTMLElement | null;
        const offset = Math.max(0, header) + (mainNav?.offsetHeight ?? 0);
        setTop(offset);
        const line = offset + (navRef.current?.offsetHeight ?? 0) + 48;
        let current = BRIEFING_SUMMARY_ANCHOR;
        for (const s of sections) {
          const el = document.getElementById(sectionAnchor(s.id));
          if (el && el.getBoundingClientRect().top <= line) current = sectionAnchor(s.id);
        }
        setActive(current);
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
    // sections ändert sich nur mit result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const chip = (isActive: boolean) =>
    `block whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-adobe-red ${
      isActive
        ? 'border-adobe-red bg-adobe-red text-white shadow-sm'
        : 'border-ts-border text-ts-text-secondary hover:border-ts-accent/50 hover:text-ts-text-primary'
    }`;

  return (
    <nav
      ref={navRef}
      aria-label={BRIEFING_SUBNAV_LABEL}
      className="sticky z-20 -mx-4 border-b border-ts-border/60 bg-ts-surface-card/95 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6"
      style={{ top }}
    >
      <ul className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-wrap lg:overflow-visible">
        <li className="shrink-0">
          <button
            type="button"
            className={chip(active === BRIEFING_SUMMARY_ANCHOR)}
            aria-current={active === BRIEFING_SUMMARY_ANCHOR ? 'true' : undefined}
            onClick={onSummary}
          >
            Executive summary
          </button>
        </li>
        {sections.map((s) => {
          const merged = s.id === ADOBE_OPPORTUNITY_SECTION;
          const isActive = active === sectionAnchor(s.id);
          return (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                className={chip(isActive)}
                aria-current={isActive ? 'true' : undefined}
                title={merged ? 'Shown in the Opportunities section' : undefined}
                onClick={() => {
                  const target = merged ? document.getElementById(MERGED_OPPORTUNITY_ANCHOR) : null;
                  if (target) {
                    window.scrollTo({
                      top: target.getBoundingClientRect().top + window.scrollY - stickyChromeBottom() - 16,
                      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
                    });
                    target.focus({ preventScroll: true });
                  } else {
                    onSection(s.id);
                  }
                }}
              >
                {s.title}
                {s.status === 'thin' && <span className="ml-1 text-amber-300" aria-label="thin data">•</span>}
                {s.status === 'error' && <span className="ml-1 text-red-300" aria-label="research failed">•</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

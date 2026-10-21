import { useCallback, useEffect, useRef, useState } from 'react';

/** Anker-IDs der Ergebnis-Sektionen; nur tatsächlich gerenderte Sektionen erscheinen in der Nav. */
const RESULT_SECTIONS = [
  { id: 'section-briefing', label: 'Pre-Briefing' },
  { id: 'section-summary', label: 'Summary' },
  { id: 'section-stack', label: 'Tech Stack' },
  { id: 'section-insights', label: 'Opportunities' },
  { id: 'section-use-cases', label: 'Use Cases' },
  { id: 'section-tech-case', label: 'Tech Case' },
  { id: 'section-deep-dive', label: 'Deep Dive' },
  { id: 'section-observepoint', label: 'ObservePoint' },
  { id: 'section-geo', label: 'GEO Score' },
] as const;

function headerBottom(): number {
  const header = document.querySelector('header');
  return header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
}

/**
 * Sticky Sprungleiste für die lange Ergebnisseite. Klebt direkt unter dem
 * (ebenfalls sticky) Header und markiert die aktuell sichtbare Sektion.
 */
export default function ResultsSectionNav() {
  const [available, setAvailable] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [top, setTop] = useState(0);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const update = () => {
      const ids = RESULT_SECTIONS.map((s) => s.id).filter((id) => document.getElementById(id));
      setAvailable((prev) => (prev.join() === ids.join() ? prev : ids));
      setTop(headerBottom());
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const offset = headerBottom() + (navRef.current?.offsetHeight ?? 0) + 24;
        let current: string | null = null;
        for (const id of available) {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top <= offset) current = id;
        }
        setActive(current);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [available]);

  const jump = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const offset = headerBottom() + (navRef.current?.offsetHeight ?? 0) + 12;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: reduce ? 'auto' : 'smooth' });
    el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }, []);

  if (available.length < 2) return null;

  return (
    <nav
      ref={navRef}
      aria-label="Result sections"
      className="sticky z-30 bg-ts-surface/90 backdrop-blur-md border-b border-ts-border/60"
      style={{ top }}
    >
      <ul className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex gap-1.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {RESULT_SECTIONS.filter((s) => available.includes(s.id)).map((s) => (
          <li key={s.id} className="shrink-0">
            <a
              href={`#${s.id}`}
              aria-current={active === s.id ? 'true' : undefined}
              onClick={(e) => {
                e.preventDefault();
                jump(s.id);
              }}
              className={`block px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                active === s.id
                  ? 'bg-adobe-red/15 border-adobe-red/40 text-ts-text-primary'
                  : 'border-transparent text-ts-text-secondary hover:text-ts-text-primary hover:bg-ts-surface-card'
              }`}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

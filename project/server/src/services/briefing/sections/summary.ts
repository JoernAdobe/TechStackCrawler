/** Kompakte Textfassung fertiger Abschnitte (Input für s14 und die Executive Summary). */
import type { BriefingBlock, BriefingSection } from '../../../types/briefing.js';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function blockLine(b: BriefingBlock, budget: number): string {
  switch (b.type) {
    case 'paragraph':
      return clip(b.text, budget);
    case 'note':
      return clip(`Note${b.title ? ` (${b.title})` : ''}: ${b.text}`, budget);
    case 'feature-grid':
      return b.cards.map((c) => `${c.label}: ${c.value}${c.detail ? ` – ${clip(c.detail, 120)}` : ''}`).join(' | ');
    case 'steps':
      return b.items.map((i) => `${i.title}: ${clip(i.body, 160)}`).join(' | ');
    case 'legend':
      return b.items.map((i) => `${i.label}: ${clip(i.text, 100)}`).join(' | ');
    case 'table':
      return [b.headers.join(' / '), ...b.rows.slice(0, 6).map((r) => r.join(' / '))].join(' | ');
  }
}

export function summarizeSection(section: BriefingSection, maxChars = 1_800): string {
  const head = `### ${section.title} [${section.status}]`;
  if (section.status === 'error' || section.status === 'skipped') return `${head}\n(no content${section.gaps[0] ? `: ${section.gaps[0]}` : ''})`;
  const lines: string[] = [];
  let used = 0;
  for (const b of section.blocks) {
    const line = blockLine(b, 600);
    if (used + line.length > maxChars) break;
    lines.push(`- ${line}`);
    used += line.length;
  }
  const sources = section.sources.map((s) => `${s.publisher ?? s.title} (${s.date}) ${s.url}`).join('; ');
  const gaps = section.gaps.length ? `\nGaps: ${clip(section.gaps.join(' / '), 300)}` : '';
  return `${head}\n${lines.join('\n')}\nSources: ${sources || 'none'}${gaps}`;
}

/**
 * submit_section-Tool-Schema und Normalisierung der LLM-Bausteine auf den BriefingBlock-Vertrag
 * (Plaintext, nummerierte Step-Titel, 2/4 Karten pro feature-grid, keine Abschnitts-Codes im Text).
 */
import { BRIEFING_SECTIONS, type BriefingBlock, type BriefingSectionId } from '../../../types/briefing.js';
import type { LlmTool } from '../llm.js';

export const SUBMIT_SECTION_TOOL: LlmTool = {
  name: 'submit_section',
  description:
    'Submit the finished section. Every fact must come from a page you fetched, a search result you saw, the registry dossier or the TechStack Analyzer facts. Cite 2–5 sources by URL.',
  input_schema: {
    type: 'object',
    properties: {
      blocks: {
        type: 'array',
        description: 'Ordered content blocks. Start with a paragraph. Plain text only (no HTML, no markdown).',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['paragraph', 'feature-grid', 'steps', 'note', 'legend', 'table'] },
            text: { type: 'string', description: 'paragraph / note text' },
            title: { type: 'string', description: 'note title (optional)' },
            cards: {
              type: 'array',
              description: 'feature-grid: exactly 2 or 4 cards',
              items: {
                type: 'object',
                properties: { label: { type: 'string' }, value: { type: 'string' }, detail: { type: 'string' } },
                required: ['label', 'value'],
              },
            },
            items: {
              type: 'array',
              description: 'steps: {title, body}; legend: {label, color (hex), text}',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  body: { type: 'string' },
                  label: { type: 'string' },
                  color: { type: 'string' },
                  text: { type: 'string' },
                },
              },
            },
            headers: { type: 'array', items: { type: 'string' } },
            rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
          },
          required: ['type'],
        },
      },
      sources: {
        type: 'array',
        description: '2–5 sources you actually used; URL must be one you fetched or saw in search results / dossier / scan facts.',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            title: { type: 'string' },
            date: { type: 'string', description: '"Mon YYYY" as shown on the page, or "n.d."' },
          },
          required: ['url', 'title'],
        },
      },
      gaps: {
        type: 'array',
        items: { type: 'string' },
        description: 'Data points not publicly available / not verified, each with the routes tried.',
      },
    },
    required: ['blocks', 'sources', 'gaps'],
  },
};

export const NUMBERED_STEP_SECTIONS: readonly BriefingSectionId[] = ['s04', 's13', 's14'];

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

const SECTION_TITLE = new Map(BRIEFING_SECTIONS.map((s) => [s.id, s.title]));

/** HTML/Markdown entfernen, Abschnitts-Codes (s04) durch den Abschnittsnamen ersetzen, Whitespace glätten. */
export function toPlainText(value: unknown): string {
  return str(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]+)\]\((?:https?:)?[^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\b[sS](0[1-9]|1[0-4])\b/g, (_m, n: string) => SECTION_TITLE.get(`s${n}` as BriefingSectionId) ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

const HEX_RE = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
const NAMED_COLORS: Record<string, string> = { blue: '#2D9CDB', green: '#27AE60', red: '#EB1000', amber: '#F2994A', orange: '#F2994A', grey: '#6E6E6E', gray: '#6E6E6E', yellow: '#F2C94C' };

function normColor(c: unknown): string {
  const s = str(c).trim();
  if (HEX_RE.test(s)) return s.toUpperCase();
  return NAMED_COLORS[s.toLowerCase()] ?? '#6E6E6E';
}

function numberTitle(title: string, n: number): string {
  return `${n}. ${title.replace(/^\s*(?:step\s*)?\d+\s*[.):-]\s*/i, '').trim()}`;
}

type RawBlock = Record<string, unknown>;

function normBlock(raw: RawBlock, sectionId: BriefingSectionId): BriefingBlock[] {
  const type = str(raw.type);
  const items = Array.isArray(raw.items) ? (raw.items as RawBlock[]) : [];
  switch (type) {
    case 'paragraph': {
      const text = toPlainText(raw.text);
      return text ? [{ type: 'paragraph', text }] : [];
    }
    case 'note': {
      const text = toPlainText(raw.text);
      const title = toPlainText(raw.title);
      return text ? [{ type: 'note', ...(title ? { title } : {}), text }] : [];
    }
    case 'feature-grid': {
      const cards = (Array.isArray(raw.cards) ? (raw.cards as RawBlock[]) : [])
        .map((c) => ({ label: toPlainText(c.label), value: toPlainText(c.value), detail: toPlainText(c.detail) }))
        .filter((c) => c.label && c.value)
        .map((c): { label: string; value: string; detail?: string } => (c.detail ? c : { label: c.label, value: c.value }));
      if (cards.length === 2 || cards.length === 4) return [{ type: 'feature-grid', cards }];
      if (cards.length === 1) return [{ type: 'note', title: cards[0].label, text: [cards[0].value, cards[0].detail].filter(Boolean).join(' – ') }];
      if (!cards.length) return [];
      return [{ type: 'table', headers: ['Item', 'Value', 'Detail'], rows: cards.map((c) => [c.label, c.value, c.detail ?? '']) }];
    }
    case 'steps': {
      const numbered = NUMBERED_STEP_SECTIONS.includes(sectionId);
      const list = items
        .map((i) => ({ title: toPlainText(i.title), body: toPlainText(i.body ?? i.text) }))
        .filter((i) => i.title && i.body)
        .map((i, idx) => ({ title: numbered ? numberTitle(i.title, idx + 1) : i.title, body: i.body }));
      return list.length ? [{ type: 'steps', items: list }] : [];
    }
    case 'legend': {
      const list = items
        .map((i) => ({ label: toPlainText(i.label ?? i.title), color: normColor(i.color), text: toPlainText(i.text ?? i.body) }))
        .filter((i) => i.label && i.text);
      return list.length ? [{ type: 'legend', items: list }] : [];
    }
    case 'table': {
      const headers = (Array.isArray(raw.headers) ? raw.headers : []).map(toPlainText).filter(Boolean);
      if (!headers.length) return [];
      const rows = (Array.isArray(raw.rows) ? (raw.rows as unknown[]) : [])
        .filter(Array.isArray)
        .map((r) => {
          const cells = (r as unknown[]).map(toPlainText).slice(0, headers.length);
          while (cells.length < headers.length) cells.push('');
          return cells;
        })
        .filter((r) => r.some(Boolean));
      return rows.length ? [{ type: 'table', headers, rows }] : [];
    }
    default:
      return [];
  }
}

/** Normalisiert alle Bausteine; garantiert einen einleitenden Absatz, sofern überhaupt Text vorhanden ist. */
export function normalizeBlocks(raw: unknown, sectionId: BriefingSectionId): BriefingBlock[] {
  const list = Array.isArray(raw) ? (raw as RawBlock[]) : [];
  let blocks = list.flatMap((b) => (b && typeof b === 'object' ? normBlock(b, sectionId) : []));
  // In s14 werden alle Step-Listen zu einer durchgehend nummerierten Empfehlungsliste.
  if (NUMBERED_STEP_SECTIONS.includes(sectionId)) {
    let n = 0;
    blocks = blocks.map((b) => (b.type === 'steps' ? { ...b, items: b.items.map((i) => ({ ...i, title: numberTitle(i.title, ++n) })) } : b));
  }
  return blocks;
}

export function normalizeGaps(raw: unknown): string[] {
  return (Array.isArray(raw) ? raw : []).map(toPlainText).filter(Boolean).slice(0, 10);
}

/** Struktur-Probleme, die eine Nachbesserung durch das Modell rechtfertigen. */
export function structuralIssues(blocks: BriefingBlock[], sectionId: BriefingSectionId): string[] {
  const issues: string[] = [];
  if (!blocks.some((b) => b.type === 'paragraph')) issues.push('Add at least one paragraph block.');
  if (!blocks.some((b) => b.type !== 'paragraph')) issues.push('Add at least one component block (feature-grid, steps, note, legend or table).');
  if (sectionId === 's14') {
    const steps = blocks.flatMap((b) => (b.type === 'steps' ? b.items : []));
    if (steps.length < 4 || steps.length > 6) issues.push(`s14 needs 4–6 product recommendation steps (found ${steps.length}).`);
    for (const s of steps) {
      if (!/Adobe/.test(s.title)) issues.push(`Step title must name a specific Adobe product: "${s.title}".`);
      if (/\b(Fit|Outcome|Timing):/.test(s.body)) issues.push(`Step "${s.title}" uses Fit/Outcome/Timing labels – write one flowing paragraph.`);
    }
  }
  return issues;
}

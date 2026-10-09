/**
 * Gemeinsame Bausteine für PowerPoint-Exporte (EAA "generate_pptx"-Parität).
 * Adobe-Brand: nur #EB1000, Schwarz, Weiß (+ Grautöne für Raster), Adobe-Clean-Font,
 * roter Thread links, Footer-Linie, echtes Adobe-A-Logo als eingebettete Datei.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import PptxGenJS from 'pptxgenjs';
import type { ConsistencyCode, KeyFinding, SolutionMappingCell, SolutionMappingMatrix } from '../types/parity.js';

export type Slide = PptxGenJS.Slide;
type TableRow = PptxGenJS.TableRow;
type TableCell = PptxGenJS.TableCell;
type TextRun = PptxGenJS.TextProps;

/** tsx lädt das CJS-Bundle (default liegt dann unter .default), Node-ESM das ES-Bundle – beides unterstützen. */
const PptxCtor = ((PptxGenJS as unknown as { default?: typeof PptxGenJS }).default ?? PptxGenJS) as typeof PptxGenJS;

export const BRAND = {
  red: 'EB1000',
  black: '000000',
  white: 'FFFFFF',
  grayDark: '4B4B4B',
  gray: '6E6E6E',
  grayMid: 'A0A0A0',
  grayLine: 'D0D0D0',
  grayBg: 'F3F3F3',
  /** Helle Tönung von Adobe-Rot für leere Matrix-Zellen (EAA: pink). */
  emptyTint: 'FDE7E6',
} as const;

/** Grautöne + Rot für Charts (Brand-konform). */
export const CHART_COLORS = [BRAND.red, BRAND.black, BRAND.grayDark, BRAND.gray, BRAND.grayMid, BRAND.grayLine, 'F59A93'];

export const FONT = process.env.DECK_FONT_FACE?.trim() || 'Adobe Clean';

const SLIDE_W = 13.333;
export const CONTENT = { x: 0.6, y: 1.5, w: 12.3, h: 5.25 } as const;
const MASTER_COVER = 'TSA_COVER';
const MASTER_CONTENT = 'TSA_CONTENT';

const LOGO_W = 0.34;
const LOGO_H = LOGO_W * (120 / 136);

let logoCache: string | null | undefined;

/** Lädt das Adobe-A-Logo als Data-URI. Pfad relativ zu src/services bzw. dist/services → server/assets. */
export function loadLogoData(): string | null {
  if (logoCache !== undefined) return logoCache;
  try {
    const logoPath = fileURLToPath(new URL('../../assets/adobe-a-logo.png', import.meta.url));
    logoCache = `image/png;base64,${readFileSync(logoPath).toString('base64')}`;
  } catch (err) {
    console.warn('[deck] Adobe logo asset not found, slides are rendered without logo:', err instanceof Error ? err.message : err);
    logoCache = null;
  }
  return logoCache;
}

/** Entfernt Steuerzeichen, die in OOXML ungültig sind, und kürzt optional. */
export function clean(value: unknown, max?: number): string {
  // eslint-disable-next-line no-control-regex
  const s = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').trim();
  if (max && s.length > max) return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
  return s;
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function formatDate(d = new Date()): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Neue Präsentation inkl. Brand-Masters. */
export function createDeck(footerLabel: string, title: string): PptxGenJS {
  const pptx = new PptxCtor();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Tech Stack Analyzer';
  pptx.company = 'Adobe';
  pptx.title = clean(title, 200);
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };
  const logo = loadLogoData();

  pptx.defineSlideMaster({
    title: MASTER_COVER,
    background: { color: BRAND.black },
    objects: [
      { rect: { x: 0.6, y: 2.1, w: 0.09, h: 3.2, fill: { color: BRAND.red }, line: { color: BRAND.red, width: 0 } } },
      ...(logo ? [{ image: { x: 0.6, y: 0.6, w: 0.68, h: 0.68 * (120 / 136), data: logo } }] : []),
      { text: { text: 'Adobe', options: { x: 1.4, y: 0.62, w: 3, h: 0.55, fontFace: FONT, fontSize: 20, bold: true, color: BRAND.white } } },
    ],
  });

  pptx.defineSlideMaster({
    title: MASTER_CONTENT,
    background: { color: BRAND.white },
    objects: [
      { rect: { x: 0.4, y: 0.45, w: 0.07, h: 0.85, fill: { color: BRAND.red }, line: { color: BRAND.red, width: 0 } } },
      { line: { x: 0.4, y: 6.95, w: SLIDE_W - 0.8, h: 0, line: { color: BRAND.grayLine, width: 0.75 } } },
      ...(logo ? [{ image: { x: 0.4, y: 7.03, w: LOGO_W * 0.8, h: LOGO_H * 0.8, data: logo } }] : []),
      {
        text: {
          text: clean(footerLabel, 120),
          options: { x: 0.8, y: 7.0, w: 9, h: 0.32, fontFace: FONT, fontSize: 9, color: BRAND.gray, valign: 'middle' as const },
        },
      },
    ],
    slideNumber: { x: SLIDE_W - 1.2, y: 7.0, w: 0.8, h: 0.32, fontFace: FONT, fontSize: 9, color: BRAND.gray, align: 'right' },
  });

  return pptx;
}

export async function deckToBuffer(pptx: PptxGenJS): Promise<Buffer> {
  const out = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

export function addCoverSlide(pptx: PptxGenJS, opts: { account: string; title: string; lines: string[] }): Slide {
  const slide = pptx.addSlide({ masterName: MASTER_COVER });
  slide.addText(clean(opts.account, 80), {
    x: 0.95, y: 2.05, w: 11.5, h: 0.9, fontFace: FONT, fontSize: 40, bold: true, color: BRAND.white, fit: 'shrink',
  });
  slide.addText(clean(opts.title, 120), {
    x: 0.95, y: 2.95, w: 11.5, h: 0.7, fontFace: FONT, fontSize: 26, color: BRAND.red, bold: true,
  });
  const lines = opts.lines.map((l) => clean(l, 160)).filter(Boolean);
  if (lines.length) {
    slide.addText(
      lines.map((text, i) => ({ text, options: { breakLine: i < lines.length - 1 } })),
      { x: 0.95, y: 3.8, w: 11.5, h: 1.5, fontFace: FONT, fontSize: 16, color: BRAND.white, valign: 'top', paraSpaceAfter: 4 },
    );
  }
  slide.addText('Adobe Confidential', { x: 0.95, y: 6.7, w: 6, h: 0.35, fontFace: FONT, fontSize: 10, color: BRAND.grayMid });
  return slide;
}

export function addContentSlide(pptx: PptxGenJS, title: string, subtitle?: string): Slide {
  const slide = pptx.addSlide({ masterName: MASTER_CONTENT });
  slide.addText(clean(title, 90), {
    x: 0.6, y: 0.4, w: 12.3, h: 0.6, fontFace: FONT, fontSize: 26, bold: true, color: BRAND.black, valign: 'middle', fit: 'shrink',
  });
  if (subtitle) {
    slide.addText(clean(subtitle, 180), {
      x: 0.6, y: 0.98, w: 12.3, h: 0.36, fontFace: FONT, fontSize: 13, color: BRAND.gray, valign: 'middle',
    });
  }
  return slide;
}

export function addEndSlide(pptx: PptxGenJS, lines: string[]): Slide {
  const slide = pptx.addSlide({ masterName: MASTER_COVER });
  slide.addText('Thank you', { x: 0.95, y: 2.3, w: 11, h: 1.0, fontFace: FONT, fontSize: 44, bold: true, color: BRAND.white });
  const body = lines.map((l) => clean(l, 200)).filter(Boolean);
  if (body.length) {
    slide.addText(
      body.map((text, i) => ({ text, options: { breakLine: i < body.length - 1 } })),
      { x: 0.95, y: 3.4, w: 11, h: 1.6, fontFace: FONT, fontSize: 14, color: BRAND.grayLine, valign: 'top', paraSpaceAfter: 4 },
    );
  }
  return slide;
}

export function addParagraph(slide: Slide, text: string, pos: { x: number; y: number; w: number; h: number }, fontSize = 14): void {
  slide.addText(clean(text, 2500), {
    ...pos, fontFace: FONT, fontSize, color: BRAND.black, valign: 'top', fit: 'shrink', paraSpaceAfter: 6,
  });
}

export function addBulletList(
  slide: Slide,
  items: string[],
  pos: { x: number; y: number; w: number; h: number },
  fontSize = 13,
): void {
  const list = items.map((i) => clean(i, 400)).filter(Boolean);
  if (!list.length) return;
  slide.addText(
    list.map((text) => ({ text, options: { bullet: { indent: 14 }, breakLine: true } })),
    { ...pos, fontFace: FONT, fontSize, color: BRAND.black, valign: 'top', fit: 'shrink', paraSpaceAfter: 5 },
  );
}

/** KPI-Kacheln (Wert groß in Rot, Label klein). */
export function addStatCards(
  slide: Slide,
  cards: Array<{ label: string; value: string }>,
  pos: { x: number; y: number; w: number; perRow?: number; cardH?: number },
): number {
  const perRow = pos.perRow ?? Math.min(4, cards.length || 1);
  const gap = 0.2;
  const cardW = (pos.w - gap * (perRow - 1)) / perRow;
  const cardH = pos.cardH ?? 1.15;
  cards.forEach((c, i) => {
    const x = pos.x + (i % perRow) * (cardW + gap);
    const y = pos.y + Math.floor(i / perRow) * (cardH + gap);
    slide.addShape('rect', { x, y, w: cardW, h: cardH, fill: { color: BRAND.grayBg }, line: { color: BRAND.grayLine, width: 0.75 } });
    slide.addShape('rect', { x, y, w: 0.06, h: cardH, fill: { color: BRAND.red }, line: { color: BRAND.red, width: 0 } });
    slide.addText(clean(c.value, 40), {
      x: x + 0.2, y: y + 0.1, w: cardW - 0.3, h: cardH * 0.55, fontFace: FONT, fontSize: 24, bold: true, color: BRAND.red, valign: 'middle', fit: 'shrink',
    });
    slide.addText(clean(c.label, 60), {
      x: x + 0.2, y: y + cardH * 0.62, w: cardW - 0.3, h: cardH * 0.32, fontFace: FONT, fontSize: 11, color: BRAND.grayDark, valign: 'top',
    });
  });
  const rows = Math.ceil(cards.length / perRow);
  return pos.y + rows * cardH + Math.max(0, rows - 1) * gap;
}

const HEADER_CELL = { bold: true, color: BRAND.white, fill: { color: BRAND.black }, fontSize: 10, valign: 'middle' as const };

export function headerRow(labels: string[]): TableRow {
  return labels.map((l) => ({ text: clean(l, 80), options: HEADER_CELL }));
}

export function textCell(text: string, opts: PptxGenJS.TableCellProps = {}): TableCell {
  return { text: clean(text, 600), options: { valign: 'top', ...opts } };
}

/** Standard-Tabelle mit Brand-Raster. */
export function addBrandTable(
  slide: Slide,
  rows: TableRow[],
  opts: { x?: number; y?: number; w?: number; colW?: number[]; fontSize?: number },
): void {
  slide.addTable(rows, {
    x: opts.x ?? CONTENT.x,
    y: opts.y ?? CONTENT.y,
    w: opts.w ?? CONTENT.w,
    colW: opts.colW,
    fontFace: FONT,
    fontSize: opts.fontSize ?? 10,
    color: BRAND.black,
    border: { type: 'solid', pt: 0.75, color: BRAND.grayLine },
    margin: 0.05,
    valign: 'top',
  });
}

/** Teilt in möglichst gleich große Blöcke mit höchstens `max` Elementen (keine Einzel-Zeile auf letzter Slide). */
export function evenChunks<T>(items: T[], max: number): T[][] {
  if (!items.length) return [];
  const parts = Math.ceil(items.length / Math.max(1, max));
  return chunk(items, Math.ceil(items.length / parts));
}

// ── Solution Mapping / Key Findings ───────────────────────────────────────
export const CODE_LABELS: Record<ConsistencyCode, string> = {
  1: 'Consistent',
  2: 'Multiple solutions',
  [-1]: 'Inconsistent coverage',
  [-2]: 'Fragmented',
  0: 'No solution detected',
};

function solutionRuns(cell: SolutionMappingCell, maxItems = 4): TextRun[] {
  const items = cell.solutions.slice(0, maxItems);
  const rest = cell.solutions.length - items.length;
  const runs: TextRun[] = items.map((s, i) => ({
    text: `${clean(s.name, 48)}${s.weak ? ' (?)' : ''}`,
    options: {
      color: s.weak ? BRAND.gray : s.isAdobe ? BRAND.red : BRAND.black,
      bold: s.isAdobe && !s.weak,
      italic: !!s.weak,
      breakLine: i < items.length - 1 || rest > 0,
    },
  }));
  if (rest > 0) runs.push({ text: `+${rest} more`, options: { color: BRAND.gray, italic: true } });
  return runs;
}

function findingFor(matrix: SolutionMappingMatrix, block: string): KeyFinding | undefined {
  return matrix.keyFindings.find((k) => k.buildingBlock === block);
}

/**
 * Solution-Mapping-Tabellen: Building Blocks × max. `maxCols` Properties + KEY FINDINGS.
 * Leere Zellen werden (wie in EAA) farbig hinterlegt.
 */
export function addSolutionMatrixSlides(
  pptx: PptxGenJS,
  matrix: SolutionMappingMatrix,
  opts: { title?: string; maxCols?: number; maxRows?: number } = {},
): void {
  const maxCols = opts.maxCols ?? 5;
  const colIdx = matrix.columns.map((_, i) => i);
  const colChunks = colIdx.length ? chunk(colIdx, maxCols) : [[]];
  // Mehrspaltige Tabellen haben schmalere Findings-Spalten → höhere Zeilen → weniger Zeilen pro Slide.
  const maxRows = opts.maxRows ?? (matrix.columns.length > 1 ? 7 : 10);
  const rowChunks = matrix.rows.length ? evenChunks(matrix.rows, maxRows) : [[]];
  const totalSlides = colChunks.length * rowChunks.length;
  let n = 0;

  for (const cols of colChunks) {
    for (const rows of rowChunks) {
      n += 1;
      const colRange = matrix.columns.length > maxCols ? `Properties ${cols[0] + 1}–${cols[cols.length - 1] + 1} of ${matrix.columns.length}` : '';
      const part = totalSlides > 1 ? `(${n}/${totalSlides})` : '';
      const slide = addContentSlide(pptx, opts.title ?? 'Solution Mapping', [colRange, part, 'Adobe solutions in red, unverified signals marked (?)'].filter(Boolean).join(' · '));

      const blockW = 2.1;
      const findingsW = cols.length <= 1 ? 5.2 : 3.4;
      const propW = cols.length ? (CONTENT.w - blockW - findingsW) / cols.length : 0;
      const header = headerRow([
        'Building Block',
        ...cols.map((i) => matrix.columns[i].label || hostnameOf(matrix.columns[i].url)),
        'KEY FINDINGS',
      ]);
      const body: TableRow[] = rows.map((row) => {
        const kf = findingFor(matrix, row.buildingBlock);
        const kfRuns: TextRun[] = kf
          ? [
              { text: CODE_LABELS[kf.code], options: { bold: true, color: kf.code === 0 || kf.code < 0 ? BRAND.red : BRAND.black, breakLine: !!kf.findings[0] } },
              ...(kf.findings[0] ? [{ text: clean(kf.findings[0], cols.length <= 1 ? 170 : 110), options: { color: BRAND.grayDark } }] : []),
            ]
          : [{ text: '—', options: { color: BRAND.gray } }];
        return [
          textCell(row.buildingBlock, { bold: true, fill: { color: BRAND.grayBg } }),
          ...cols.map((i): TableCell => {
            const cell = row.cells[i] ?? { solutions: [] };
            return cell.solutions.length
              ? { text: solutionRuns(cell), options: { valign: 'top' } }
              : { text: '', options: { fill: { color: BRAND.emptyTint } } };
          }),
          { text: kfRuns, options: { valign: 'top', fontSize: 8 } },
        ];
      });
      addBrandTable(slide, [header, ...body], { colW: [blockW, ...cols.map(() => propW), findingsW], fontSize: 9 });
    }
  }
}

/** Detail-Slides: alle Key Findings je Building Block. */
export function addKeyFindingsDetailSlides(pptx: PptxGenJS, matrix: SolutionMappingMatrix, perSlide = 6): void {
  const findings = matrix.keyFindings.filter((k) => k.findings.length || k.solutions.length);
  if (!findings.length) return;
  const parts = evenChunks(findings, perSlide);
  parts.forEach((part, idx) => {
    const slide = addContentSlide(pptx, 'Key Findings', parts.length > 1 ? `Part ${idx + 1} of ${parts.length}` : 'Consistency assessment per building block');
    const rows: TableRow[] = [
      headerRow(['Building Block', 'Assessment', 'Detected Solutions', 'Findings']),
      ...part.map((k) => [
        textCell(k.buildingBlock, { bold: true, fill: { color: BRAND.grayBg } }),
        textCell(CODE_LABELS[k.code], { bold: true, color: k.code <= 0 ? BRAND.red : BRAND.black }),
        textCell(k.solutions.length ? k.solutions.join(', ') : '—'),
        textCell(k.findings.map((f) => `• ${f}`).join('\n') || '—', { fontSize: 9 }),
      ]),
    ];
    addBrandTable(slide, rows, { colW: [2.1, 1.8, 3.0, 5.4], fontSize: 10 });
  });
}

/** Technologien ohne Building-Block-Zuordnung, mehrspaltig. */
export function addOtherTechnologiesSlide(pptx: PptxGenJS, names: string[], title = 'Other Technologies'): void {
  const list = [...new Set(names.map((n) => clean(n, 60)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (!list.length) return;
  const max = 90;
  const shown = list.slice(0, max);
  const slide = addContentSlide(
    pptx,
    title,
    `${list.length} technologies without building-block mapping${list.length > max ? ` (first ${max} shown)` : ''}`,
  );
  const cols = chunk(shown, Math.ceil(shown.length / 3));
  const colW = CONTENT.w / 3;
  cols.forEach((c, i) => {
    addBulletList(slide, c, { x: CONTENT.x + i * colW, y: CONTENT.y, w: colW - 0.2, h: CONTENT.h }, shown.length > 45 ? 10 : 12);
  });
}

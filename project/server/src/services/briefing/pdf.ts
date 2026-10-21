import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../../config.js';

const PDF_TIMEOUT_MS = 90_000;
const MAX_CONCURRENT = 2;

const CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

/** Druck-Styles für den PDF-Export: Sprung-Navigation ausblenden, Farben erhalten. */
export const PRINT_CSS = `<style id="pdf-print">
@page { size: A4; margin: 12mm 10mm; }
@media print {
  #navBtn, #navMenu { display: none !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  h2, h3, h4, .section-bar { break-after: avoid; page-break-after: avoid; }
  .section-bar, .toc, .feature-card, .tag-label { break-inside: avoid; page-break-inside: avoid; }
  table, tr, .card, .stat, .note { break-inside: avoid; page-break-inside: avoid; }
}
</style>`;

export function withPrintStyles(html: string): string {
  return html.includes('</head>') ? html.replace('</head>', `${PRINT_CSS}\n</head>`) : `${PRINT_CSS}\n${html}`;
}

export function resolveChromium(): string | null {
  const configured = config.scraper.chromiumPath;
  if (configured && existsSync(configured)) return configured;
  return CANDIDATES.find((p) => existsSync(p)) ?? null;
}

export class PdfUnavailableError extends Error {}

let running = 0;
const waiting: Array<() => void> = [];

async function acquire(): Promise<() => void> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  return () => {
    running -= 1;
    waiting.shift()?.();
  };
}

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: PDF_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(`Chromium PDF export failed: ${err.message}${stderr ? ` – ${String(stderr).slice(0, 300)}` : ''}`));
      else resolve();
    });
  });
}

/** Rendert ein self-contained HTML-Dokument per Headless-Chromium als PDF. */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const bin = resolveChromium();
  if (!bin) throw new PdfUnavailableError('PDF export is not available on this server (no Chromium found).');
  const release = await acquire();
  const dir = await mkdtemp(path.join(tmpdir(), 'briefing-pdf-'));
  try {
    const input = path.join(dir, 'report.html');
    const output = path.join(dir, 'report.pdf');
    await writeFile(input, withPrintStyles(html), 'utf8');
    await run(bin, [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--no-pdf-header-footer',
      '--print-to-pdf-no-header',
      `--user-data-dir=${path.join(dir, 'profile')}`,
      `--print-to-pdf=${output}`,
      pathToFileURL(input).href,
    ]);
    const pdf = await readFile(output);
    if (pdf.subarray(0, 4).toString('latin1') !== '%PDF') throw new Error('Chromium did not produce a valid PDF.');
    return pdf;
  } finally {
    release();
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Client Pre-Briefing – powered by Chris Whitehead.
 * Führt assets/briefing/scripts/validate-briefing.py (Wrapper um validate-report.py) aus.
 * Ein fehlgeschlagener Check lässt den Job nicht scheitern – das Ergebnis landet in result.validation.
 */
import { spawn } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { BRIEFING_SECTION_IDS, type BriefingSectionId, type BriefingValidation } from '../../types/briefing.js';
import { briefingAssetsPath } from './render.js';

const TIMEOUT_MS = 20_000;
const MAX_OUTPUT = 1_000_000;

function pythonBin(): string {
  return process.env.SCRAPLING_PYTHON_PATH?.trim() || 'python3';
}

/** Temp-Basisordner; per BRIEFING_TMP_DIR überschreibbar (z. B. für Tests). */
function tmpBase(): string {
  return process.env.BRIEFING_TMP_DIR?.trim() || os.tmpdir();
}

function unavailable(reason: string): BriefingValidation {
  return { ok: true, errors: [], warnings: [`validator unavailable (${reason})`] };
}

interface RunOutput {
  code: number | null;
  stdout: string;
  timedOut: boolean;
  spawnError?: NodeJS.ErrnoException;
}

function runPython(args: string[]): Promise<RunOutput> {
  return new Promise((resolve) => {
    let stdout = '';
    let timedOut = false;
    let settled = false;
    const done = (out: RunOutput) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(out);
    };
    const child = spawn(pythonBin(), args, { stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, TIMEOUT_MS);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (stdout.length < MAX_OUTPUT) stdout += chunk;
    });
    child.on('error', (err) => done({ code: null, stdout, timedOut, spawnError: err }));
    child.on('close', (code) => done({ code, stdout, timedOut }));
  });
}

function parseOutput(stdout: string): BriefingValidation | null {
  const line = stdout.trim().split('\n').reverse().find((l) => l.trim().startsWith('{'));
  if (!line) return null;
  try {
    const parsed = JSON.parse(line) as Partial<BriefingValidation>;
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    const errors = strings(parsed.errors);
    return { ok: parsed.ok === true && errors.length === 0, errors, warnings: strings(parsed.warnings) };
  } catch {
    return null;
  }
}

export async function validateBriefingHtml(html: string, sections: BriefingSectionId[]): Promise<BriefingValidation> {
  const selected = BRIEFING_SECTION_IDS.filter((id) => sections.includes(id));
  let dir: string | null = null;
  try {
    dir = await mkdtemp(path.join(tmpBase(), 'briefing-validate-'));
    const file = path.join(dir, 'report.html');
    await writeFile(file, html, 'utf8');
    const script = briefingAssetsPath('scripts', 'validate-briefing.py');
    const out = await runPython([script, file, '--json', `--sections=${selected.join(',')}`]);
    if (out.spawnError) return unavailable(out.spawnError.code === 'ENOENT' ? 'python not found' : 'python could not be started');
    if (out.timedOut) return unavailable('timeout');
    const parsed = parseOutput(out.stdout);
    if (!parsed) return unavailable(`unexpected output, exit code ${out.code}`);
    return parsed;
  } catch (err) {
    console.error('Briefing validator failed:', err instanceof Error ? err.message : err);
    return unavailable('internal error');
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

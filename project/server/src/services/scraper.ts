import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { config } from '../config.js';
import { localeForUrl } from '../utils/locale.js';
import { sanitizeUrlWithDns } from '../utils/sanitize.js';
import type { ConsentSnapshot } from './consentAudit.js';

export interface ScrapedData {
  url: string;
  finalUrl: string;
  html: string;
  headers: Record<string, string[]>;
  meta: Record<string, string[]>;
  scriptSrc: string[];
  cookies: Record<string, string>;
  title: string;
  bodyText: string;
  links: string[];
  /** Alle Request-URLs der Seite (Beacons, XHR, Pixel) – Basis für Netzwerk-Signale. */
  requests: string[];
  /** Ergebnisse der JS-Global-Probes (python/js_probes.js): key → Version/IDs/"present". */
  jsGlobals: Record<string, string>;
  /** Zusammenfassung der AEP-Edge-Antworten, z. B. "decisionProvider:TGT", "handle:activation:push". */
  edgeSignals: string[];
  /** Consent-Audit-Snapshot unmittelbar vor dem Banner-Klick (nur gefüllt, wenn geklickt wurde). */
  consent?: ConsentSnapshot;
}

const SCRAPED_DATA_SCHEMA = z.object({
  url: z.string(),
  finalUrl: z.string(),
  html: z.string(),
  headers: z.record(z.string(), z.array(z.string())),
  meta: z.record(z.string(), z.array(z.string())),
  scriptSrc: z.array(z.string()),
  cookies: z.record(z.string(), z.string()),
  title: z.string(),
  bodyText: z.string(),
  links: z.array(z.string()),
  requests: z.array(z.string()).default([]),
  jsGlobals: z.record(z.string(), z.string()).default({}),
  edgeSignals: z.array(z.string()).default([]),
  consent: z
    .object({
      bannerAccepted: z.boolean(),
      preConsentRequests: z.array(z.string()),
      preConsentCookies: z.array(z.string()),
    })
    .strict()
    .optional(),
}).strict();

const WORKER_PATH = fileURLToPath(new URL('../../python/scrapling_crawler.py', import.meta.url));
const MAX_STDOUT_BYTES = 16 * 1024 * 1024;
const MAX_STDERR_CHARS = 8_000;
const WORKER_SHUTDOWN_GRACE_MS = 2_000;

export type ScrapeProgressCallback = (message: string) => void;

async function withHeartbeat<T>(
  promise: Promise<T>,
  onProgress: ScrapeProgressCallback,
  intervalMs = 5000,
): Promise<T> {
  const started = Date.now();
  const beat = setInterval(() => {
    onProgress(`Scrapling is rendering the page… (${Math.round((Date.now() - started) / 1000)}s)`);
  }, intervalMs);
  try {
    return await promise;
  } finally {
    clearInterval(beat);
  }
}

function publicWorkerError(stderr: string): string {
  if (/Blocked|private|reserved|unsafe/i.test(stderr)) {
    return 'Blocked unsafe or private target';
  }
  if (/Timeout|timed out/i.test(stderr)) {
    return `Scrapling timed out after ${config.scraper.timeout}ms`;
  }
  return 'Scrapling could not render the page';
}

function terminateWorker(pid: number | undefined, signal: NodeJS.Signals): void {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      process.kill(pid, signal);
    } else {
      process.kill(-pid, signal);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

function runWorker(url: string): Promise<ScrapedData> {
  const { acceptLanguage, timezone } = localeForUrl(url);

  return new Promise((resolve, reject) => {
    const child = spawn(
      config.scraper.pythonPath,
      [WORKER_PATH],
      { detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const stdoutChunks: Buffer[] = [];
    let stderr = '';
    let stdoutBytes = 0;
    let timedOut = false;
    let outputTooLarge = false;
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const settleError = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      terminateWorker(child.pid, 'SIGTERM');
      forceKillTimer = setTimeout(
        () => terminateWorker(child.pid, 'SIGKILL'),
        WORKER_SHUTDOWN_GRACE_MS,
      );
    }, config.scraper.timeout + 15_000);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        outputTooLarge = true;
        terminateWorker(child.pid, 'SIGTERM');
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-MAX_STDERR_CHARS);
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      settleError(new Error(`Could not start Scrapling worker: ${error.message}`));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (settled) return;
      if (timedOut) {
        settleError(new Error(`Scrapling timed out after ${config.scraper.timeout}ms`));
        return;
      }
      if (outputTooLarge) {
        settleError(new Error('Scrapling worker returned an oversized result'));
        return;
      }
      if (code !== 0) {
        const detail = stderr.trim();
        console.warn(`[scraper] Scrapling worker exited with ${signal ?? code}: ${detail}`);
        settleError(new Error(publicWorkerError(detail)));
        return;
      }
      try {
        const stdout = Buffer.concat(stdoutChunks).toString('utf8');
        resolve(SCRAPED_DATA_SCHEMA.parse(JSON.parse(stdout)));
      } catch (error) {
        console.warn(`[scraper] Invalid Scrapling worker response: ${(error as Error).message}`);
        settleError(new Error('Invalid Scrapling worker response'));
      }
    });

    child.stdin.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code !== 'EPIPE') {
        terminateWorker(child.pid, 'SIGTERM');
        settleError(new Error(`Could not send request to Scrapling worker: ${error.message}`));
      }
    });
    child.stdin.end(JSON.stringify({
      url,
      timeoutMs: config.scraper.timeout,
      locale: acceptLanguage.split(',')[0],
      timezone,
    }));
  });
}

export async function scrapePage(
  url: string,
  onProgress: ScrapeProgressCallback = () => {},
): Promise<ScrapedData> {
  onProgress('Checking the target URL…');
  const safeUrl = await sanitizeUrlWithDns(url);
  if (!safeUrl) throw new Error('Blocked unsafe or unresolved target URL');

  onProgress('Starting Scrapling…');
  const scraped = await withHeartbeat(runWorker(safeUrl), onProgress);
  return SCRAPED_DATA_SCHEMA.parse(scraped);
}

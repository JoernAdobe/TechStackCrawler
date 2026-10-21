/**
 * Server-zu-Server-Integration (z. B. RFP Automation Suite): Library-Liste und
 * verdichteter Account-Kontext. Geschützt per Shared Secret im Header
 * `X-Integration-Token` (Env INTEGRATION_TOKEN); ohne gesetztes Secret deaktiviert.
 */
import { timingSafeEqual } from 'crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { getPool } from '../db/index.js';
import { getAnalysisById, listBriefingCompanyNames, listLibraryRows } from '../db/analyses.js';
import { getLatestDoneBriefingResult } from '../db/briefingJobs.js';
import { DbUnavailableError, NotFoundError, parseParams, asyncHandler } from '../utils/http.js';
import { buildLibrary, type LibraryAccount, type LibraryRow } from '../services/library.js';
import { buildAccountContext } from '../services/accountContext.js';
import type { BriefingSummary } from '../types/briefing.js';

function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireIntegrationToken(req: Request, res: Response, next: NextFunction) {
  const expected = (process.env.INTEGRATION_TOKEN || '').trim();
  if (!expected) {
    res.status(503).json({ error: 'Integration API not configured', code: 'integration_disabled' });
    return;
  }
  const given = String(req.header('x-integration-token') || '').trim();
  if (!given || !tokenMatches(given, expected)) {
    res.status(401).json({ error: 'Invalid integration token', code: 'unauthorized' });
    return;
  }
  next();
}

function parseBriefing(json: string | null): BriefingSummary | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as BriefingSummary) : undefined;
  } catch {
    return undefined;
  }
}

async function loadLibrary(): Promise<LibraryAccount[]> {
  const pool = getPool();
  if (!pool) throw new DbUnavailableError('Database not available');
  const [rows, names] = await Promise.all([listLibraryRows(pool), listBriefingCompanyNames(pool)]);
  const libraryRows: LibraryRow[] = rows.map((r) => ({
    id: r.id,
    url: r.url,
    analyzedAt: r.analyzedAt,
    briefing: parseBriefing(r.briefingJson),
    companyName: names.get(r.id) ?? null,
  }));
  return buildLibrary(libraryRows);
}

const keySchema = z.object({ key: z.string().min(1).max(255) });

export function createIntegrationRoutes(opts: { limiter: (req: Request, res: Response, next: NextFunction) => void }) {
  const router = Router();
  router.use('/api/integration', opts.limiter, requireIntegrationToken);

  router.get(
    '/api/integration/library',
    asyncHandler(async (_req, res) => {
      const accounts = await loadLibrary();
      res.json({
        accounts: accounts.map((a) => ({
          key: a.key,
          name: a.name,
          domain: a.domain,
          analysisCount: a.analysisCount,
          latestAnalyzedAt: a.latest.analyzedAt,
          briefingScore: a.briefing?.overallScore ?? null,
        })),
      });
    }),
  );

  router.get(
    '/api/integration/accounts/:key/context',
    asyncHandler(async (req, res) => {
      const { key } = parseParams(keySchema, req.params);
      const account = (await loadLibrary()).find((a) => a.key === key.toLowerCase());
      if (!account) throw new NotFoundError('Account not found');
      const pool = getPool()!;
      const analysis = await getAnalysisById(pool, account.latest.id);
      if (!analysis) throw new NotFoundError('Analysis not found');
      const briefing = await getLatestDoneBriefingResult(pool, account.briefing?.analysisId ?? account.latest.id);
      res.json({
        key: account.key,
        name: account.name,
        domain: account.domain,
        analysisId: account.latest.id,
        analyzedAt: account.latest.analyzedAt,
        hasBriefing: !!briefing,
        context: buildAccountContext({ name: account.name, domain: account.domain, analysis, briefing }),
      });
    }),
  );

  return router;
}

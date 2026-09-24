import { z } from 'zod';
import { passwordHashFormat, verifyPassword } from '../utils/passwordHash.js';
import type { Request, Response, NextFunction } from 'express';
import { getPool } from '../db/index.js';
import type { AnalysisResult } from '../types/analysis.js';
import { createSession, getSession } from '../services/sessionStore.js';
import { config } from '../config.js';
import { ServiceUnavailableError, UnauthorizedError, ForbiddenError, DbUnavailableError, parseBody } from '../utils/http.js';

const MANUAL_HOURS_PER_ANALYSIS = 3.5;
const CONSULTANT_HOURLY_RATE = 150;

/** Cookie-Name des Okta-/Session-Cookies (identisch in oktaAuth.ts). */
const SESSION_COOKIE = 'ts_session';

const loginSchema = z.object({
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
});

/**
 * Break-Glass-Passwort-Login (Notfallzugang, falls Okta nicht verfügbar/konfiguriert).
 *
 * Credentials kommen ausschließlich aus der Umgebung (DASHBOARD_EMAIL +
 * DASHBOARD_PASSWORD_HASH). Ohne beide Werte ist der Endpunkt deaktiviert — es gibt
 * bewusst keinen Default, damit nie ein aus dem Quellcode ableitbares Passwort existiert.
 * Hash-Format: scrypt (empfohlen) oder Legacy-SHA-256, siehe utils/passwordHash.ts.
 */
export function dashboardLogin(req: Request, res: Response) {
  const { breakGlassEmail, breakGlassPasswordHash } = config.dashboard;
  if (!breakGlassEmail || !breakGlassPasswordHash) {
    throw new ServiceUnavailableError(
      'Break-glass login is disabled. Set DASHBOARD_EMAIL and DASHBOARD_PASSWORD_HASH to enable it.',
    );
  }
  // Ein fehlerhaft formatierter Hash würde sonst still jeden Login mit 401 ablehnen.
  if (passwordHashFormat(breakGlassPasswordHash) === 'invalid') {
    throw new ServiceUnavailableError(
      'Break-glass login is misconfigured: DASHBOARD_PASSWORD_HASH has an unknown format.',
    );
  }

  const { email, password } = parseBody(loginSchema, req.body);

  const emailMatches = email.trim().toLowerCase() === breakGlassEmail;
  // Hash immer prüfen (auch bei falscher E-Mail), damit die Antwortzeit nichts verrät.
  const hashMatches = verifyPassword(password, breakGlassPasswordHash);

  if (!emailMatches || !hashMatches) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const token = createSession(breakGlassEmail, true);
  res.json({ token });
}

/**
 * Schützt Dashboard-Routen. Akzeptiert entweder einen Bearer-Token (Break-Glass)
 * ODER das ts_session-Cookie (Okta-Login). Beide Kandidaten werden gegen den
 * gemeinsamen Session-Store geprüft — kein Early-Return, damit ein leerer/ungültiger
 * Bearer nicht ein gültiges Cookie blockiert. Erfordert isAdmin.
 */
export function requireDashboardAuth(req: Request, _res: Response, next: NextFunction) {
  const candidates: string[] = [];

  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const bearer = auth.slice(7).trim();
    if (bearer) candidates.push(bearer);
  }

  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
  if (cookieToken) candidates.push(cookieToken);

  const session = candidates.map((t) => getSession(t)).find((s) => s !== null) ?? null;

  if (!session) {
    throw new UnauthorizedError();
  }
  if (!session.isAdmin) {
    throw new ForbiddenError('Admin access required');
  }
  next();
}

interface TechCount {
  name: string;
  count: number;
}

interface WeekBucket {
  week: string;
  count: number;
}

interface DashboardStats {
  totalAnalyses: number;
  uniqueDomains: number;
  avgTechPerAnalysis: number;
  totalTechDetected: number;
  adobeOpportunities: number;
  useCaseDiscoveries: number;
  estimatedHoursSaved: number;
  estimatedCostSaved: number;
  analysesPerWeek: WeekBucket[];
  topTechnologies: TechCount[];
  categoryBreakdown: TechCount[];
  firstAnalysisDate: string | null;
  daysSinceFirstUse: number;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export async function dashboardStats(_req: Request, res: Response) {
  const pool = getPool();
  if (!pool) {
    throw new DbUnavailableError();
  }

  {
    const { rows } = await pool.execute(
      'SELECT id, url, result_json, analyzed_at FROM analyses ORDER BY analyzed_at ASC',
    );
    const analyses = (Array.isArray(rows) ? rows : []) as Array<{
      id: number;
      url: string;
      result_json: string;
      analyzed_at: string | Date;
    }>;

    const domains = new Set<string>();
    const techCounts = new Map<string, number>();
    const categoryCounts = new Map<string, number>();
    const weekCounts = new Map<string, number>();
    let totalTech = 0;
    let adobeOpps = 0;
    let useCaseCount = 0;

    for (const row of analyses) {
      domains.add(extractDomain(row.url));

      const dateStr = typeof row.analyzed_at === 'string'
        ? row.analyzed_at
        : row.analyzed_at.toISOString();
      const weekKey = getWeekKey(dateStr);
      weekCounts.set(weekKey, (weekCounts.get(weekKey) ?? 0) + 1);

      let parsed: AnalysisResult;
      try {
        parsed = JSON.parse(row.result_json) as AnalysisResult;
      } catch {
        continue;
      }

      if (parsed.rawDetections) {
        totalTech += parsed.rawDetections.length;
        for (const det of parsed.rawDetections) {
          techCounts.set(det.name, (techCounts.get(det.name) ?? 0) + 1);
          if (det.categories) {
            for (const cat of det.categories) {
              categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
            }
          }
        }
      }

      if (parsed.categories) {
        for (const cat of parsed.categories) {
          if (cat.adobeOpportunity && !/^(none|n\/a|na|-|—)$/i.test(cat.adobeOpportunity.trim())) {
            adobeOpps++;
          }
        }
      }

      if (parsed.useCaseDiscovery?.useCases?.length) {
        useCaseCount++;
      }
    }

    const totalAnalyses = analyses.length;
    const firstDate = analyses.length > 0
      ? (typeof analyses[0].analyzed_at === 'string'
        ? analyses[0].analyzed_at
        : analyses[0].analyzed_at.toISOString())
      : null;
    const daysSinceFirst = firstDate
      ? Math.floor((Date.now() - new Date(firstDate).getTime()) / 86400000)
      : 0;

    const topTechnologies = [...techCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, count]) => ({ name, count }));

    const categoryBreakdown = [...categoryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, count]) => ({ name, count }));

    const analysesPerWeek = [...weekCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, count]) => ({ week, count }));

    const stats: DashboardStats = {
      totalAnalyses,
      uniqueDomains: domains.size,
      avgTechPerAnalysis: totalAnalyses > 0 ? Math.round((totalTech / totalAnalyses) * 10) / 10 : 0,
      totalTechDetected: totalTech,
      adobeOpportunities: adobeOpps,
      useCaseDiscoveries: useCaseCount,
      estimatedHoursSaved: Math.round(totalAnalyses * MANUAL_HOURS_PER_ANALYSIS * 10) / 10,
      estimatedCostSaved: Math.round(totalAnalyses * MANUAL_HOURS_PER_ANALYSIS * CONSULTANT_HOURLY_RATE),
      analysesPerWeek,
      topTechnologies,
      categoryBreakdown,
      firstAnalysisDate: firstDate,
      daysSinceFirstUse: daysSinceFirst,
    };

    res.json(stats);
  }
}

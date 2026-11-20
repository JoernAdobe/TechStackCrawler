import type { Request, Response, NextFunction } from 'express';
import { getPool } from '../db/index.js';
import type { AnalysisResult } from '../types/analysis.js';
import { getSession } from '../services/sessionStore.js';
import { isAdminEmail } from '../services/admins.js';
import { config } from '../config.js';
import { computeUsageStats, type FunnelInput, type UsageStats } from '../services/usageStats.js';
import { UnauthorizedError, ForbiddenError, DbUnavailableError } from '../utils/http.js';

const MANUAL_HOURS_PER_ANALYSIS = 5;
const CONSULTANT_HOURLY_RATE = 150;

/** Cookie-Name des Okta-/Session-Cookies (identisch in oktaAuth.ts). */
const SESSION_COOKIE = 'ts_session';

/**
 * Schützt Dashboard-Routen: nur Okta-Session (ts_session-Cookie), Admin-Status
 * wird live gegen fixe + gepflegte Admins geprüft (Entfernen wirkt sofort).
 * Setzt res.locals.adminEmail für nachgelagerte Handler.
 */
export function requireDashboardAuth(req: Request, res: Response, next: NextFunction) {
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
  const session = getSession(cookieToken);
  if (!session) {
    next(new UnauthorizedError());
    return;
  }
  isAdminEmail(session.email).then((ok) => {
    if (!ok) {
      next(new ForbiddenError('Admin access required'));
      return;
    }
    res.locals.adminEmail = session.email.trim().toLowerCase();
    next();
  }, next);
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
  analysesLast30d: number;
  topAccounts: TechCount[];
  usage: UsageStats;
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
    let last30 = 0;
    const domainCounts = new Map<string, number>();
    const funnel: FunnelInput[] = [];

    for (const row of analyses) {
      const domain = extractDomain(row.url);
      domains.add(domain);
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);

      const dateStr = typeof row.analyzed_at === 'string'
        ? row.analyzed_at
        : row.analyzed_at.toISOString();
      if (Date.now() - new Date(dateStr).getTime() <= 30 * 86400000) last30++;
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
      funnel.push({
        analysisId: row.id,
        domain,
        hasUseCases: Boolean(parsed.useCaseDiscovery?.useCases?.length),
        hasGeo: Boolean(parsed.enrichments?.geo),
      });
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
      analysesLast30d: last30,
      topAccounts: [...domainCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count })),
      usage: await computeUsageStats(pool, funnel, config.adminEmails),
    };

    res.json(stats);
  }
}

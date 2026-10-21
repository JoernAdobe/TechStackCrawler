import type { Request, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../db/index.js';
import { getAnalysisById } from '../db/analyses.js';
import { findOpenBriefingJob } from '../db/briefingJobs.js';
import { autoUseCasesStatus, runTrackedUseCases } from '../services/useCaseAuto.js';
import { discoverUseCases } from '../services/useCaseDiscovery.js';
import type { AnalysisResult } from '../types/analysis.js';
import { DbUnavailableError, NotFoundError, parseBody, parseParams } from '../utils/http.js';

/**
 * Minimal-Schema für den eingehenden Analyse-Payload. Bewusst `passthrough`,
 * da der Client das vollständige Analyse-Objekt zurückschickt und hier nur die
 * Felder geprüft werden, die `discoverUseCases` tatsächlich benötigt.
 */
const analysisSchema = z
  .object({
    id: z.number().int().positive().optional(),
    url: z.string().min(1),
    summary: z.string(),
    analyzedAt: z.string(),
    categories: z.array(z.unknown()),
    rawDetections: z.array(z.unknown()),
  })
  .passthrough();

export async function useCaseDiscoveryRoute(req: Request, res: Response) {
  const parsed = parseBody(analysisSchema, req.body);
  const pool = getPool();

  // Gespeicherte Analysen werden serverseitig aus der DB geladen. Der Client-Payload wird
  // dann ignoriert – sonst könnte jeder mit einer beliebigen `id` und manipuliertem
  // `summary` (Prompt-Injection) fremde Datensätze überschreiben.
  if (pool && parsed.id) {
    const stored = await getAnalysisById(pool, parsed.id);
    if (!stored) throw new NotFoundError('Analysis not found');
    // Getrackter Lauf mit allen Daten inkl. Pre-Briefing: wird sofort gespeichert und läuft weiter,
    // auch wenn der Client die Verbindung verliert (Client holt das Ergebnis per Status-Polling).
    const result = await runTrackedUseCases(pool, parsed.id);
    res.json({ ok: true, result });
    return;
  }

  const analysis: AnalysisResult = { ...(parsed as unknown as AnalysisResult), id: undefined };
  const { result } = await discoverUseCases(analysis);
  res.json({ ok: true, result });
}

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** GET /api/analyses/:id/use-cases/status – Status der automatischen Use-Case-Discovery (Client pollt). */
export async function useCaseStatusRoute(req: Request, res: Response) {
  const { id } = parseParams(idParamSchema, req.params);
  const pool = getPool();
  if (!pool) throw new DbUnavailableError();
  const auto = autoUseCasesStatus(id);
  // Läuft/wartet noch ein Pre-Briefing, kommt danach ein zweiter Lauf mit den Briefing-Insights.
  const briefingPending = Boolean(await findOpenBriefingJob(pool, id));
  if (auto.status === 'running') {
    res.json({ ...auto, briefingPending });
    return;
  }
  const analysis = await getAnalysisById(pool, id);
  if (!analysis) throw new NotFoundError('Analysis not found');
  const result = analysis.useCaseDiscovery;
  res.json(result ? { status: 'done', result, briefingPending } : { ...auto, briefingPending });
}

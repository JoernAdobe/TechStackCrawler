/**
 * MCP-Tools für das Client Pre-Briefing (powered by Chris Whitehead): Start + Status/Score als JSON.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getPool } from '../db/index.js';
import { getAnalysisById } from '../db/analyses.js';
import { config } from '../config.js';
import { briefingDeps, normalizeBriefingSections } from '../services/batchBriefing.js';
import {
  BRIEFING_CREDIT,
  BRIEFING_SECTION_IDS,
  type BriefingJob,
  type BriefingStateResponse,
} from '../types/briefing.js';

const json = (data: unknown): CallToolResult => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const fail = (msg: string): CallToolResult => ({ content: [{ type: 'text', text: msg }], isError: true });

const DEFAULT_PUBLIC_BASE = 'https://techstack.corp.adobe.com';

/** Öffentliche Basis-URL für Links in MCP-Antworten (PUBLIC_BASE_URL → Okta-Redirect-Origin → Default). */
export function publicBaseUrl(): string {
  const explicit = process.env.PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  try {
    if (config.okta.redirectUri) return new URL(config.okta.redirectUri).origin;
  } catch {
    // ungültige Redirect-URI → Default
  }
  return DEFAULT_PUBLIC_BASE;
}

export const briefingReportUrl = (jobId: number): string => `${publicBaseUrl()}/api/briefings/${jobId}/report.html`;

const ASYNC_HINT = 'Runs asynchronously and takes ~5–10 minutes – poll get-client-briefing with the jobId.';

function jobView(job: BriefingJob) {
  return {
    id: job.id,
    analysisId: job.analysisId,
    status: job.status,
    sections: job.sections,
    progress: job.progress,
    ...(job.companyName ? { companyName: job.companyName } : {}),
    ...(job.batchId ? { batchId: job.batchId } : {}),
    ...(job.error ? { error: job.error } : {}),
    createdAt: job.createdAt,
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    ...(job.finishedAt ? { finishedAt: job.finishedAt } : {}),
  };
}

/** JSON-Antwort von get-client-briefing (exportiert für Tests). */
export function briefingStateView(state: BriefingStateResponse, includeSections: boolean) {
  const { job, result } = state;
  if (!job) return null;
  const ex = result?.executive;
  return {
    credit: BRIEFING_CREDIT,
    job: jobView(job),
    overallScore: ex?.overallScore ?? null,
    band: ex?.band ?? null,
    confidence: ex?.confidence ?? null,
    verdict: ex?.verdict ?? null,
    bullets: ex?.bullets ?? [],
    subScores: ex?.subScores ?? [],
    topPlays: ex?.topPlays ?? [],
    reportUrl: job.status === 'done' ? briefingReportUrl(job.id) : null,
    ...(job.status === 'done' ? {} : { hint: ASYNC_HINT }),
    ...(includeSections && result ? { sections: result.sections, validation: result.validation } : {}),
  };
}

const sectionsSchema = z
  .array(z.enum(BRIEFING_SECTION_IDS))
  .max(BRIEFING_SECTION_IDS.length)
  .optional()
  .describe('Section IDs s01–s14 (default: all). s14 "Adobe Opportunity" is always included.');

export function registerBriefingTools(server: McpServer): void {
  server.registerTool(
    'start-client-briefing',
    {
      title: 'Start Client Pre-Briefing',
      description:
        `Start a Client Pre-Briefing (${BRIEFING_CREDIT}) for a saved analysis: researched, source-backed account briefing ` +
        `(up to 14 sections) plus an Overall Pre-Briefing Score (0–100). ${ASYNC_HINT} ` +
        'If a briefing for the analysis is already queued/running, that job is returned.',
      inputSchema: { analysisId: z.number().int().positive().describe('Numeric id of the saved analysis'), sections: sectionsSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ analysisId, sections }) => {
      const db = getPool();
      if (!db) return fail('Database not available');
      try {
        const analysis = await getAnalysisById(db, analysisId);
        if (!analysis) return fail(`Analysis with ID ${analysisId} not found`);
        const job = await briefingDeps().enqueueBriefing({
          analysisId,
          sections: normalizeBriefingSections(sections),
          createdBy: 'mcp',
        });
        return json({ credit: BRIEFING_CREDIT, job: jobView(job), hint: ASYNC_HINT, reportUrl: briefingReportUrl(job.id) });
      } catch (err) {
        return fail(`Starting the Client Pre-Briefing failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.registerTool(
    'get-client-briefing',
    {
      title: 'Get Client Pre-Briefing',
      description:
        `Get status, Overall Pre-Briefing Score, band, confidence, verdict, C-level bullets, sub-scores, top Adobe plays and ` +
        `the report URL of a Client Pre-Briefing (${BRIEFING_CREDIT}). Pass jobId or analysisId (latest job). ` +
        'Briefings take ~5–10 minutes – poll until job.status is "done". Full sections only with includeSections. ' +
        'Read-only; use start-client-briefing instead to begin a new briefing.',
      inputSchema: {
        analysisId: z.number().int().positive().optional().describe('Numeric id of a saved analysis – returns its latest briefing'),
        jobId: z.number().int().positive().optional().describe('Numeric id of a specific briefing job'),
        includeSections: z.boolean().default(false).describe('Include the full report sections (large)'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ analysisId, jobId, includeSections }) => {
      if (!jobId && !analysisId) return fail('Provide jobId or analysisId');
      try {
        const deps = briefingDeps();
        const state = jobId ? await deps.getBriefingState(jobId) : await deps.getLatestBriefingForAnalysis(analysisId!);
        const view = briefingStateView(state, includeSections);
        if (!view) {
          return fail(
            jobId
              ? `Client Pre-Briefing job ${jobId} not found`
              : `No Client Pre-Briefing for analysis ${analysisId} yet – start one with start-client-briefing`,
          );
        }
        return json(view);
      } catch (err) {
        return fail(`Reading the Client Pre-Briefing failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

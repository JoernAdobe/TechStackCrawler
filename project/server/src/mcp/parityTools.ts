/**
 * MCP-Tools und -Prompts für die EAA-Parität (Account-/Bulk-Assessments, Enrichments,
 * GEO-Score, Solution Mapping, Key Findings, Stack History, Deck, Feedback).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getPool } from '../db/index.js';
import { getAnalysisById } from '../db/analyses.js';
import { saveEnrichment } from '../db/enrichments.js';
import { createBatch, getBatch, listBatches } from '../db/batches.js';
import { insertFeedback } from '../db/feedback.js';
import type { DbHandle } from '../db/types.js';
import { enqueueBatch } from '../services/batchRunner.js';
import { MAX_ACCOUNT_URLS, MAX_BULK_URLS, normalizeBatchItems } from '../services/batchInput.js';
import { batchApprovalThreshold } from '../routes/batches.js';
import { runLighthouse } from '../services/lighthouse.js';
import { getTraffic } from '../services/traffic.js';
import { findMobileApps } from '../services/mobileApps.js';
import { runGeoScore } from '../services/geoScore.js';
import { getStackHistory } from '../services/stackHistory.js';
import { buildSolutionMatrix } from '../services/keyFindings.js';
import { buildAnalysisDeck, buildBatchDeck } from '../services/deck.js';
import { BUILDING_BLOCKS } from '../data/buildingBlocks.js';
import { FEEDBACK_TYPES } from '../routes/feedback.js';
import type { AnalysisResult } from '../types/analysis.js';
import type { BatchStatus } from '../types/parity.js';
import { resolveEnrichmentOptions } from '../services/batchEnrichment.js';
import { MAX_BRIEFING_ITEMS, refreshBatchBriefings } from '../services/batchBriefing.js';
import { BRIEFING_CREDIT, BRIEFING_SECTION_IDS } from '../types/briefing.js';
import { registerBriefingTools } from './briefingTools.js';

type ToolResult = CallToolResult;

const json = (data: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const fail = (msg: string): ToolResult => ({ content: [{ type: 'text', text: msg }], isError: true });

async function withDb(fn: (db: DbHandle) => Promise<ToolResult>): Promise<ToolResult> {
  const db = getPool();
  if (!db) return fail('Database not available');
  try {
    return await fn(db);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

async function withAnalysis(id: number, fn: (db: DbHandle, a: AnalysisResult) => Promise<ToolResult>): Promise<ToolResult> {
  return withDb(async (db) => {
    const analysis = await getAnalysisById(db, id);
    if (!analysis) return fail(`Analysis with ID ${id} not found`);
    return fn(db, analysis);
  });
}

const analysisId = z.number().int().positive().describe('The analysis ID');
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export function registerParityTools(server: McpServer): void {
  server.tool(
    'get-assessment-types',
    'List the assessment types this server supports (EAA "get_eaa_types_supported").',
    {},
    async () =>
      json({
        types: [
          { type: 'single', description: 'Single URL tech stack analysis with Adobe opportunities (tool: analyze-url).' },
          { type: 'account', description: `Account / web assessment: up to ${MAX_ACCOUNT_URLS} URLs with lens + labels, solution mapping and key findings (tool: create-assessment).` },
          { type: 'bulk', description: `Bulk assessment: up to ${MAX_BULK_URLS} URLs, detection-only by default; above ${batchApprovalThreshold()} URLs admin approval is required.` },
          { type: 'enrichments', description: 'On-demand Lighthouse, traffic (Semrush/Tranco), mobile apps and GEO / AI visibility score per analysis.' },
          { type: 'client-briefing', description: `${BRIEFING_CREDIT}: researched account briefing (14 sections) + Overall Pre-Briefing Score per analysis; runs 5–10 min asynchronously (tools: start-client-briefing, get-client-briefing; batch option briefing on create-assessment, max ${MAX_BRIEFING_ITEMS} accounts).` },
          { type: 'stack-history', description: 'Multi-run view of a domain with added/removed technologies.' },
        ],
        buildingBlocks: BUILDING_BLOCKS,
        notSupported: ['Panorama entitlements', 'Salesforce account search', 'Mobile SDK binary analysis'],
      }),
  );

  server.tool(
    'create-assessment',
    'Create an account assessment (≤30 URLs) or bulk assessment (≤1000 URLs). Runs asynchronously – poll with get-assessment. ' +
      `Optional briefing: Client Pre-Briefing (${BRIEFING_CREDIT}) for the first ${MAX_BRIEFING_ITEMS} successful URLs ` +
      '(forces a full AI analysis for those; ~5–10 min and ~$1–3 per account after the scan; poll get-client-briefing).',
    {
      kind: z.enum(['account', 'bulk']).default('account'),
      title: z.string().min(1).max(255).regex(/^[\p{L}\p{N}_]/u, 'Title must start with a letter, digit or underscore'),
      urls: z.array(z.object({ url: z.string().max(2048), label: z.string().max(255).optional() })).min(1).max(MAX_BULK_URLS),
      lens: z.enum(['Brand', 'Geo', 'Journey Stage', 'Competitors', 'Other']).optional(),
      accountName: z.string().max(255).optional(),
      industry: z.string().max(255).optional(),
      opportunityId: z.string().max(64).optional(),
      aiAnalysis: z.boolean().optional().describe('Full Claude analysis per URL (default: true for account, false for bulk)'),
      briefing: z.boolean().optional().describe(`Client Pre-Briefing for the first ${MAX_BRIEFING_ITEMS} successful URLs`),
      briefingSections: z.array(z.enum(BRIEFING_SECTION_IDS)).max(BRIEFING_SECTION_IDS.length).optional()
        .describe('Briefing sections s01–s14 (default: all)'),
    },
    async (args) =>
      withDb(async (db) => {
        const parsed = normalizeBatchItems(args.urls, MAX_BULK_URLS);
        if (parsed.items.length === 0) return fail(`No valid URLs: ${parsed.errors.join('; ')}`);
        if (args.kind === 'account' && parsed.items.length > MAX_ACCOUNT_URLS) {
          return fail(`Account assessments support up to ${MAX_ACCOUNT_URLS} URLs – use kind "bulk".`);
        }
        const needsApproval = args.kind === 'bulk' && parsed.items.length > batchApprovalThreshold();
        const status: BatchStatus = needsApproval ? 'pending_approval' : 'queued';
        const aiAnalysis = args.aiAnalysis ?? args.kind === 'account';
        const enrichmentOptions = args.briefing
          ? resolveEnrichmentOptions(args.kind, aiAnalysis, {
              briefing: true,
              briefingSections: args.briefingSections,
              maxCostlyItems: MAX_BRIEFING_ITEMS,
            })
          : undefined;
        const id = await createBatch(db, {
          kind: args.kind,
          title: args.title,
          status,
          lens: args.lens,
          accountName: args.accountName,
          industry: args.industry,
          opportunityId: args.opportunityId,
          aiAnalysis,
          createdBy: 'mcp',
          items: parsed.items,
          ...(enrichmentOptions ? { enrichmentOptions } : {}),
        });
        if (status === 'queued') enqueueBatch(id);
        return json({ id, status, urls: parsed.items.length, warnings: parsed.errors });
      }),
  );

  server.tool(
    'get-assessment',
    'Get status, items, solution mapping matrix and key findings of an account/bulk assessment.',
    { id: z.number().int().positive(), includeItems: z.boolean().default(false) },
    async ({ id, includeItems }) =>
      withDb(async (db) => {
        const batch = await getBatch(db, id);
        if (!batch) return fail(`Assessment ${id} not found`);
        await refreshBatchBriefings(db, batch);
        return json(includeItems ? batch : { ...batch, items: undefined });
      }),
  );

  server.tool(
    'list-assessments',
    'List recent account/bulk assessments.',
    { limit: z.number().int().min(1).max(200).default(20) },
    async ({ limit }) => withDb(async (db) => json(await listBatches(db, limit))),
  );

  server.tool(
    'solution-mapping',
    'Build an EAA-style building-block solution mapping + key findings across saved analyses (EAA "create_solution_category_mapping" / "generate_key_findings").',
    { analysisIds: z.array(z.number().int().positive()).min(1).max(30) },
    async ({ analysisIds }) =>
      withDb(async (db) => {
        const inputs = [];
        for (const id of analysisIds) {
          const a = await getAnalysisById(db, id);
          if (!a) return fail(`Analysis with ID ${id} not found`);
          inputs.push({ url: a.finalUrl ?? a.url, analysisId: id, detections: a.rawDetections });
        }
        return json(buildSolutionMatrix(inputs));
      }),
  );

  server.tool(
    'lighthouse',
    'Run Google PageSpeed Insights / Lighthouse (mobile + desktop) for a saved analysis and store the result.',
    { analysisId },
    async ({ analysisId: id }) =>
      withAnalysis(id, async (db, a) => {
        const result = await runLighthouse(a.finalUrl ?? a.url);
        await saveEnrichment(db, id, 'lighthouse', result);
        return json(result);
      }),
  );

  server.tool(
    'traffic-insights',
    'Get traffic insights (Semrush if configured, Tranco rank always) for a saved analysis and store the result.',
    { analysisId },
    async ({ analysisId: id }) =>
      withAnalysis(id, async (db, a) => {
        const result = await getTraffic(a.finalUrl ?? a.url);
        await saveEnrichment(db, id, 'traffic', result);
        return json(result);
      }),
  );

  server.tool(
    'mobile-apps',
    'Find the brand\'s iOS/Android apps (website links, smart banners, App Store search) for a saved analysis.',
    { analysisId, brand: z.string().max(200).optional(), country: z.string().length(2).optional() },
    async ({ analysisId: id, brand, country }) =>
      withAnalysis(id, async (db, a) => {
        const result = await findMobileApps({ url: a.finalUrl ?? a.url, brand, country });
        await saveEnrichment(db, id, 'mobileApps', result);
        return json(result);
      }),
  );

  server.tool(
    'geo-score',
    'Compute the GEO / AI visibility score (brand mentions in Claude answers across funnel queries vs. competitors). Takes 1–3 minutes.',
    {
      analysisId,
      brand: z.string().max(200).optional(),
      competitors: z.array(z.string().max(200)).max(5).optional(),
      country: z.string().max(6).optional(),
      queryCount: z.number().int().min(8).max(40).optional(),
    },
    async ({ analysisId: id, ...opts }) =>
      withAnalysis(id, async (db, a) => {
        const result = await runGeoScore(a, opts);
        await saveEnrichment(db, id, 'geo', result);
        return json(result);
      }),
  );

  server.tool(
    'get_evidence_matrix',
    'Read the stored multi-source Evidence Matrix (TechStack × ObservePoint consensus, agreement rate) and the ObservePoint summary (incl. insights: versions, Adobe footprint, quality, privacy, findings) of a saved analysis. Read-only: never triggers ObservePoint calls.',
    { analysisId },
    async ({ analysisId: id }) =>
      withAnalysis(id, async (_db, a) => {
        const { evidenceMatrix, observepoint } = a.enrichments ?? {};
        if (!evidenceMatrix) {
          return json({
            analysisId: id,
            evidenceMatrix: null,
            hint: `No Evidence Matrix stored yet. Run the ObservePoint enrichment first: POST /api/analyses/${id}/enrich/observepoint with body {"mode":"reuse"} (or "fresh" if fresh scans are enabled).`,
          });
        }
        const { tags, ...summary } = observepoint ?? { tags: [] };
        return json({
          analysisId: id,
          observepoint: observepoint ? { ...summary, tagCount: tags.length } : null,
          evidenceMatrix,
        });
      }),
  );

  server.tool(
    'stack-history',
    'Show how the tech stack of a domain changed across saved analyses (added/removed technologies).',
    { url: z.string().min(1).max(2048) },
    async ({ url }) => withDb(async (db) => json(await getStackHistory(db, url))),
  );

  server.tool(
    'generate-deck',
    'Generate an Adobe-branded PowerPoint deck for a single analysis or an account/bulk assessment.',
    { analysisId: z.number().int().positive().optional(), assessmentId: z.number().int().positive().optional() },
    async ({ analysisId: aId, assessmentId }) =>
      withDb(async (db) => {
        let buf: Buffer;
        let name: string;
        if (assessmentId) {
          const batch = await getBatch(db, assessmentId);
          if (!batch) return fail(`Assessment ${assessmentId} not found`);
          buf = await buildBatchDeck(batch);
          name = `assessment-${assessmentId}.pptx`;
        } else if (aId) {
          const a = await getAnalysisById(db, aId);
          if (!a) return fail(`Analysis with ID ${aId} not found`);
          buf = await buildAnalysisDeck(a);
          name = `analysis-${aId}.pptx`;
        } else {
          return fail('Provide analysisId or assessmentId');
        }
        const path = assessmentId ? `/api/batches/${assessmentId}/deck.pptx` : `/api/analyses/${aId}/deck.pptx`;
        return {
          content: [
            { type: 'text', text: `Deck generated (${Math.round(buf.length / 1024)} KB). Download: ${path}` },
            { type: 'resource', resource: { uri: `techstack://deck/${name}`, mimeType: PPTX_MIME, blob: buf.toString('base64') } },
          ],
        };
      }),
  );

  server.tool(
    'submit-feedback',
    'Submit feedback, e.g. a missing or wrong detection, for an analysis or assessment.',
    {
      type: z.enum(FEEDBACK_TYPES),
      description: z.string().min(1).max(4000),
      title: z.string().max(200).optional(),
      analysisId: z.number().int().positive().optional(),
      assessmentId: z.number().int().positive().optional(),
      missingSolutions: z
        .array(z.object({ url: z.string().max(2048).optional(), solution: z.string().min(1).max(200), category: z.string().max(100).optional() }))
        .max(20)
        .optional(),
    },
    async (args) =>
      withDb(async (db) => {
        const id = await insertFeedback(db, {
          type: args.type,
          description: args.description,
          title: args.title,
          analysisId: args.analysisId,
          batchId: args.assessmentId,
          missingSolutions: args.missingSolutions,
          createdBy: 'mcp',
        });
        return json({ id, status: 'open' });
      }),
  );

  registerBriefingTools(server);

  server.prompt(
    'assessment-workflow',
    'Step-by-step workflow for an account tech assessment.',
    { account: z.string().optional() },
    ({ account }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Run a tech stack assessment${account ? ` for ${account}` : ''}:`,
              '1. Collect the account\'s digital properties (brands, country sites, journey stages).',
              `2. 1 URL → analyze-url. 2–${MAX_ACCOUNT_URLS} URLs → create-assessment kind "account" with a lens and labels. More → kind "bulk".`,
              '3. Poll get-assessment until status is "completed".',
              '4. Interpret the solution mapping: key finding codes 1 = consistent, 2 = multiple on one property, -1 = inconsistent, -2 = different per property, 0 = none.',
              '5. Optionally enrich single analyses with lighthouse, traffic-insights, mobile-apps and geo-score.',
              '6. Generate the deck with generate-deck and summarize the top 3 Adobe opportunities.',
              `7. Optionally run a Client Pre-Briefing (${BRIEFING_CREDIT}) with start-client-briefing and poll get-client-briefing (5–10 min).`,
            ].join('\n'),
          },
        },
      ],
    }),
  );

  server.prompt(
    'key-findings-guide',
    'How to read key findings and turn them into Adobe opportunities.',
    {},
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              'Explain the key findings of the assessment per building block. Codes: 1 one solution consistently deployed; 2 multiple solutions on the same property; ' +
              '-1 one solution, not on all properties; -2 different solutions on different properties; 0 no solution. ' +
              'Prioritize gaps (0) and fragmentation (-2, 2) where an Adobe product (AEP/RTCDP, AJO, CJA, Target, AEM, Analytics, Tags) consolidates the stack. ' +
              'Weak (unverified) detections are excluded from the codes.',
          },
        },
      ],
    }),
  );
}

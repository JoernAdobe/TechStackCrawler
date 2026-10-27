import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { analyzeUrl, type AnalysisWriter } from '../services/analyzer.js';
import { sanitizeUrlWithDns } from '../utils/sanitize.js';
import { validateUrlInput } from '../utils/urlInput.js';
import { preflightUrl } from '../services/urlPreflight.js';
import { getPool } from '../db/index.js';
import { listAnalyses, getAnalysisById } from '../db/analyses.js';
import { discoverUseCases } from '../services/useCaseDiscovery.js';
import { getLatestDoneBriefingResult } from '../db/briefingJobs.js';
import { saveUseCaseDiscovery } from '../db/enrichments.js';
import type { AnalysisResult } from '../types/analysis.js';
import { asyncHandler } from '../utils/http.js';
import { registerParityTools } from './parityTools.js';

/**
 * Aktive MCP-Transports. Ohne Aufräumen würde diese Map unbegrenzt wachsen, wenn
 * Clients ihre Session nicht sauber per DELETE beenden (Verbindungsabbruch, Crash).
 * Deshalb: Zeitstempel pro Session, periodischer Prune und eine harte Obergrenze.
 */
const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_PRUNE_INTERVAL_MS = 5 * 60 * 1000;
const MAX_SESSIONS = 500;

interface McpSession {
  transport: StreamableHTTPServerTransport;
  lastSeen: number;
}

const sessions = new Map<string, McpSession>();

function touchSession(sessionId: string): StreamableHTTPServerTransport | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() - session.lastSeen > SESSION_TTL_MS) {
    void closeSession(sessionId);
    return null;
  }
  // Neu einfügen, damit die Map-Reihenfolge echte LRU-Semantik hat. Sonst würde die
  // Verdrängung bei MAX_SESSIONS aktive Nutzer treffen, die nur früh verbunden haben.
  sessions.delete(sessionId);
  session.lastSeen = Date.now();
  sessions.set(sessionId, session);
  return session.transport;
}

async function closeSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  sessions.delete(sessionId);
  try {
    await session.transport.close();
  } catch (err) {
    console.warn(`[mcp] Fehler beim Schließen von Session ${sessionId}:`, err);
  }
}

/** Verdrängt die am längsten inaktiven Sessions, bis das Limit wieder eingehalten wird. */
function enforceSessionLimit(): void {
  while (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest === undefined) break;
    void closeSession(oldest);
  }
}

function pruneSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastSeen > SESSION_TTL_MS) void closeSession(id);
  }
  enforceSessionLimit();
}

const pruneTimer = setInterval(pruneSessions, SESSION_PRUNE_INTERVAL_MS);
// Der Timer darf den Prozess nicht am Beenden hindern.
pruneTimer.unref?.();

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'techstack-analyzer', version: '1.0.0' },
    { capabilities: { logging: {} } },
  );

  server.registerTool(
    'analyze-url',
    {
      title: 'Analyze website tech stack',
      description:
        'Run a new live tech stack analysis of one public website: renders the page in a headless browser, detects ' +
        'technologies (analytics, CMS, CDP, tag management, personalization, commerce, …) and lets Claude map Adobe ' +
        'opportunities and a summary. Takes ~30–90 s and saves the result as a new analysis (returns its id). ' +
        'For an analysis that already exists use get-analysis instead; for 2–30 URLs of one account use create-assessment.',
      inputSchema: {
        url: z.string().describe('Public website URL or domain to analyze, e.g. "https://www.example.com" or "example.com"'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ url }) => {
      const input = validateUrlInput(url);
      if (!input.ok) {
        return { content: [{ type: 'text', text: [input.message, input.hint].filter(Boolean).join(' ') }], isError: true };
      }
      const preflight = await preflightUrl(input.url);
      if (!preflight.ok) {
        return { content: [{ type: 'text', text: `${preflight.message} ${preflight.hint}` }], isError: true };
      }
      const sanitized = await sanitizeUrlWithDns(input.url);
      if (!sanitized) {
        return { content: [{ type: 'text', text: 'Invalid or disallowed URL' }], isError: true };
      }

      const progress: string[] = [];
      let result: AnalysisResult | null = null;
      let error: string | null = null;

      const writer: AnalysisWriter = {
        sendProgress(_phase, message) { progress.push(message); },
        sendResult(r) { result = r as AnalysisResult; },
        sendError(msg) { error = msg; },
        close() {},
      };

      try {
        await analyzeUrl(sanitized, writer);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }

      if (error || !result) {
        return {
          content: [{ type: 'text', text: `Analysis failed: ${error ?? 'No result'}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    'list-analyses',
    {
      title: 'List saved analyses',
      description:
        'List previously saved single-URL tech stack analyses, newest first, with id, URL and analysis date. ' +
        'Read-only; only lists. Use get-analysis instead for the full result of one analysis, ' +
        'and list-assessments for account/bulk assessments.',
      inputSchema: { limit: z.number().int().min(1).max(100).default(20).describe('Maximum number of results (1-100, default 20)') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ limit }) => {
      const pool = getPool();
      if (!pool) {
        return { content: [{ type: 'text', text: 'Database not available' }], isError: true };
      }

      const rows = await listAnalyses(pool, limit);
      const items = rows.map((r) => ({
        id: r.id,
        url: r.url,
        analyzedAt: r.analyzed_at,
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify(items, null, 2) }],
      };
    },
  );

  server.registerTool(
    'get-analysis',
    {
      title: 'Get saved analysis',
      description:
        'Get the full stored result of one saved tech stack analysis by its numeric id: detected technologies, ' +
        'categories, Adobe opportunities, summary and stored enrichments. Read-only; does not re-crawl the website ' +
        '(use analyze-url instead for a fresh scan).',
      inputSchema: { id: z.number().int().positive().describe('Numeric id of the saved analysis (from analyze-url or list-analyses)') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const pool = getPool();
      if (!pool) {
        return { content: [{ type: 'text', text: 'Database not available' }], isError: true };
      }

      const result = await getAnalysisById(pool, id);
      if (!result) {
        return { content: [{ type: 'text', text: `Analysis with ID ${id} not found` }], isError: true };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    'use-case-discovery',
    {
      title: 'Discover Adobe use cases',
      description:
        'Generate prioritized Adobe use case recommendations (AEP/RTCDP, AJO, CJA, Target, AEM, …) for a saved analysis, ' +
        'based on its detected stack, the site map and, if available, the latest Client Pre-Briefing. Calls Claude and stores the ' +
        'result on the analysis, replacing an earlier use case discovery. Requires an existing analysis id; ' +
        'run analyze-url first if there is none.',
      inputSchema: { analysisId: z.number().int().positive().describe('Numeric id of the saved analysis to generate use cases for') },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ analysisId }) => {
      const pool = getPool();
      if (!pool) {
        return { content: [{ type: 'text', text: 'Database not available' }], isError: true };
      }

      const analysis = await getAnalysisById(pool, analysisId);
      if (!analysis) {
        return { content: [{ type: 'text', text: `Analysis with ID ${analysisId} not found` }], isError: true };
      }

      try {
        const briefing = await getLatestDoneBriefingResult(pool, analysisId);
        const { result, sitemapUrls } = await discoverUseCases(analysis, { briefing });

        try {
          await saveUseCaseDiscovery(pool, analysisId, { useCaseDiscovery: result, sitemapUrls });
        } catch {
          // non-critical
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Use case discovery failed: ${msg}` }], isError: true };
      }
    },
  );

  registerParityTools(server);

  return server;
}

export function createMcpRoutes(): Router {
  const router = Router();

  router.post(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId) {
      const transport = touchSession(sessionId);
      if (!transport) {
        res.status(400).json({ error: 'Invalid session ID', code: 'invalid_session' });
        return;
      }
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (isInitializeRequest(req.body)) {
      pruneSessions();

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { transport, lastSeen: Date.now() });
          enforceSessionLimit();
        },
      });

      transport.onclose = () => {
        const sid = [...sessions.entries()].find(([, s]) => s.transport === transport)?.[0];
        if (sid) sessions.delete(sid);
      };

      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      error: 'Bad request: no session ID and not an initialize request',
      code: 'bad_request',
    });
    }),
  );

  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      const transport = sessionId ? touchSession(sessionId) : null;
      if (!transport) {
        res.status(400).json({ error: 'Invalid or missing session ID', code: 'invalid_session' });
        return;
      }
      await transport.handleRequest(req, res);
    }),
  );

  router.delete(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !sessions.has(sessionId)) {
        res.status(400).json({ error: 'Invalid or missing session ID', code: 'invalid_session' });
        return;
      }
      await closeSession(sessionId);
      res.status(200).json({ ok: true });
    }),
  );

  return router;
}

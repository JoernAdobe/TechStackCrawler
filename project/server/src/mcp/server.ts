import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { analyzeUrl, type AnalysisWriter } from '../services/analyzer.js';
import { sanitizeUrl } from '../utils/sanitize.js';
import { getPool } from '../db/index.js';
import { listAnalyses, getAnalysisById, updateAnalysis } from '../db/analyses.js';
import { discoverUseCases } from '../services/useCaseDiscovery.js';
import type { AnalysisResult } from '../types/analysis.js';

const sessions = new Map<string, StreamableHTTPServerTransport>();

function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'techstack-analyzer', version: '1.0.0' },
    { capabilities: { logging: {} } },
  );

  server.tool(
    'analyze-url',
    'Analyze a website\'s technology stack using Puppeteer scraping and Claude AI. Returns detected technologies, Adobe opportunities, and a summary.',
    { url: z.string().describe('The URL of the website to analyze') },
    async ({ url }) => {
      const sanitized = sanitizeUrl(url);
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

  server.tool(
    'list-analyses',
    'List previously saved technology stack analyses from the database.',
    { limit: z.number().min(1).max(100).default(20).describe('Maximum number of results (1-100)') },
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

  server.tool(
    'get-analysis',
    'Get the full details of a specific technology stack analysis by its ID.',
    { id: z.number().int().positive().describe('The analysis ID') },
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

  server.tool(
    'use-case-discovery',
    'Generate Adobe use case recommendations based on an existing analysis. Requires a valid analysis ID from the database.',
    { analysisId: z.number().int().positive().describe('The analysis ID to generate use cases for') },
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
        const { result, sitemapUrls } = await discoverUseCases(analysis);

        try {
          await updateAnalysis(pool, analysisId, { useCaseDiscovery: result, sitemapUrls });
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

  return server;
}

export function createMcpRoutes(): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      const transport = sessions.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (sessionId && !sessions.has(sessionId)) {
      res.status(400).json({ error: 'Invalid session ID' });
      return;
    }

    if (isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, transport);
        },
      });

      transport.onclose = () => {
        const sid = [...sessions.entries()].find(([, t]) => t === transport)?.[0];
        if (sid) sessions.delete(sid);
      };

      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({ error: 'Bad request: no session ID and not an initialize request' });
  });

  router.get('/', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }
    const transport = sessions.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  router.delete('/', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }
    const transport = sessions.get(sessionId)!;
    await transport.close();
    sessions.delete(sessionId);
    res.status(200).json({ ok: true });
  });

  return router;
}

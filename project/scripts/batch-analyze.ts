/**
 * Batch-Analyse mehrerer Accounts über den MCP-Endpoint (analyze-url + use-case-discovery).
 *
 *   MCP_TOKEN=… npx tsx scripts/batch-analyze.ts <accounts.tsv> <outDir>
 *
 * accounts.tsv: pro Zeile "Name<TAB>URL". Ergebnis: <outDir>/<slug>.json
 * Bereits vorhandene Ergebnisse werden übersprungen (FORCE=1 erzwingt Neulauf).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

interface Account { name: string; url: string; slug: string }

const MCP_URL = process.env.MCP_URL || 'https://techstack.corp.adobe.com/mcp';
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY) || 2);
const ANALYZE_TIMEOUT = 360_000;
const USECASE_TIMEOUT = 240_000;

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n');
}

async function connect(token: string): Promise<Client> {
  const client = new Client({ name: 'techstack-batch', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

async function call(token: string, name: string, args: Record<string, unknown>, timeout: number) {
  const client = await connect(token);
  try {
    const res = await client.callTool({ name, arguments: args }, undefined, { timeout, resetTimeoutOnProgress: true });
    return { isError: Boolean(res.isError), text: textOf(res) };
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function runAccount(token: string, acc: Account, outDir: string): Promise<string> {
  const file = join(outDir, `${acc.slug}.json`);
  if (existsSync(file) && process.env.FORCE !== '1') return `${acc.name}: übersprungen (vorhanden)`;

  const started = Date.now();
  let analysis: Record<string, unknown> | null = null;
  let lastError = '';
  for (let attempt = 1; attempt <= 2 && !analysis; attempt++) {
    try {
      const r = await call(token, 'analyze-url', { url: acc.url }, ANALYZE_TIMEOUT);
      if (r.isError) lastError = r.text.slice(0, 400);
      else analysis = JSON.parse(r.text);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    if (!analysis) console.log(`  ${acc.name}: Versuch ${attempt} fehlgeschlagen – ${lastError}`);
  }
  const analyzeSecs = Math.round((Date.now() - started) / 1000);

  let useCases: unknown = null;
  let useCaseError = '';
  const id = analysis?.id;
  if (typeof id === 'number') {
    try {
      const r = await call(token, 'use-case-discovery', { analysisId: id }, USECASE_TIMEOUT);
      if (r.isError) useCaseError = r.text.slice(0, 400);
      else useCases = JSON.parse(r.text);
    } catch (e) {
      useCaseError = e instanceof Error ? e.message : String(e);
    }
  } else if (analysis) {
    useCaseError = 'Keine Analyse-ID (DB nicht verfügbar?)';
  }

  writeFileSync(file, JSON.stringify({
    account: acc.name, url: acc.url, analyzeSecs,
    error: analysis ? null : lastError, analysis, useCases, useCaseError: useCaseError || null,
  }, null, 2));
  const n = Array.isArray(analysis?.rawDetections) ? (analysis!.rawDetections as unknown[]).length : 0;
  return `${acc.name}: ${analysis ? `✓ ${n} Technologien in ${analyzeSecs}s` : `✗ ${lastError}`}`
    + `${useCases ? ', Use Cases ✓' : useCaseError ? `, Use Cases ✗ (${useCaseError.slice(0, 120)})` : ''}`;
}

async function main(): Promise<number> {
  const token = (process.env.MCP_TOKEN || '').trim();
  const [listFile, outDir] = process.argv.slice(2);
  if (!token || !listFile || !outDir) {
    console.error('Usage: MCP_TOKEN=… npx tsx scripts/batch-analyze.ts <accounts.tsv> <outDir>');
    return 2;
  }
  mkdirSync(outDir, { recursive: true });
  const accounts: Account[] = readFileSync(listFile, 'utf8').split('\n')
    .map((l) => l.split('\t').map((s) => s.trim()))
    .filter((p) => p.length >= 2 && p[1].startsWith('http'))
    .map(([name, url]) => ({ name, url, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }));

  console.log(`${accounts.length} Accounts, Parallelität ${CONCURRENCY}, Endpoint ${MCP_URL}`);
  const queue = [...accounts];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let acc = queue.shift(); acc; acc = queue.shift()) {
      console.log(`… ${acc.name} (${acc.url})`);
      console.log(await runAccount(token, acc, outDir));
    }
  }));
  return 0;
}

main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });

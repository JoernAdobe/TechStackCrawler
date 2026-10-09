/**
 * End-to-End-Smoke-Test des MCP-Endpoints, so wie Coworker ihn nutzt
 * (Streamable HTTP + Bearer-Token, `tsa_…` oder IMS-User-Token).
 *
 * Ausführen (im project-Verzeichnis):
 *   MCP_TOKEN=… npm run test:mcp
 *   MCP_TOKEN=… npm run test:mcp -- --list-only
 *   MCP_TOKEN=… MCP_URL=http://localhost:3001/mcp npm run test:mcp -- https://www.bmw.de
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const EXPECTED_TOOLS = ['analyze-url', 'get-analysis', 'list-analyses', 'use-case-discovery'];

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n');
}

async function main(): Promise<number> {
  const url = process.env.MCP_URL || 'https://techstack.corp.adobe.com/mcp';
  const token = (process.env.MCP_TOKEN || '').trim();
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list-only');
  const target = args.find((a) => !a.startsWith('--')) || 'https://example.com';

  if (!token) {
    console.error('MCP_TOKEN fehlt (API-Token `tsa_…` oder IMS-Access-Token).');
    return 2;
  }
  const tokenType = token.startsWith('tsa_') ? 'API-Token' : 'IMS-Token';
  console.log(`\n=== MCP-Smoke-Test ===\nEndpoint: ${url}\nAuth:     ${tokenType}\n`);

  const client = new Client({ name: 'techstack-mcp-smoke', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });

  try {
    await client.connect(transport);
    console.log(`✓ initialize – Server: ${client.getServerVersion()?.name ?? '?'}`);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    const missing = EXPECTED_TOOLS.filter((t) => !names.includes(t));
    console.log(`${missing.length ? '✗' : '✓'} tools/list – ${names.join(', ')}`);
    if (missing.length) {
      console.error(`  fehlend: ${missing.join(', ')}`);
      return 1;
    }

    if (listOnly) return 0;

    console.log(`… analyze-url ${target} (kann 30–90 s dauern)`);
    const started = Date.now();
    const result = await client.callTool({ name: 'analyze-url', arguments: { url: target } });
    const text = textOf(result);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (result.isError) {
      console.error(`✗ analyze-url nach ${secs}s – ${text.slice(0, 500)}`);
      return 1;
    }
    console.log(`✓ analyze-url nach ${secs}s – ${text.length} Zeichen`);
    console.log(`\n${text.slice(0, 1500)}${text.length > 1500 ? '\n…' : ''}\n`);
    return 0;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`✗ ${msg}`);
    if (/401/.test(msg)) console.error('  → Token ungültig/abgelaufen oder nicht erlaubt (Server-Log: [mcp-auth]).');
    return 1;
  } finally {
    await client.close().catch(() => undefined);
  }
}

main().then((code) => process.exit(code));

/**
 * Bildet die error-Regeln von `gateway-quality lint` (aif, libraries/mcp-evals/catalog_lint/checks.py)
 * für alle MCP-Tools lokal nach – Voraussetzung für das CX-Coworker-Gateway-Onboarding.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

process.env.DB_PATH = ':memory:';

const { createMcpServer } = await import('../src/mcp/server.js');

const server = createMcpServer();
const client = new Client({ name: 'lint-client', version: '1.0.0' });
const [clientT, serverT] = InMemoryTransport.createLinkedPair();
await Promise.all([server.connect(serverT), client.connect(clientT)]);
const { tools } = await client.listTools();

after(async () => {
  await client.close();
  await server.close();
});

/** Tools, die die Stage-/Prod-Card per include_tools freigibt (Golden-Datensatz deckt sie ab). */
const GATEWAY_TOOLS = ['analyze-url', 'list-analyses', 'get-analysis', 'use-case-discovery'];

test('alle Gateway-Tools sind registriert', () => {
  const names = tools.map((t) => t.name);
  for (const name of GATEWAY_TOOLS) assert.ok(names.includes(name), `${name} fehlt`);
});

test('Beschreibungen: 40–1024 Zeichen, Name ≤ 64 Zeichen, Titel gesetzt', () => {
  for (const t of tools) {
    const desc = (t.description ?? '').trim();
    assert.ok(desc.length >= 40, `${t.name}: description zu kurz (${desc.length})`);
    assert.ok((t.description ?? '').length <= 1024, `${t.name}: description zu lang`);
    assert.ok(t.name.length <= 64, `${t.name}: Name zu lang`);
    assert.ok(t.title?.trim() || t.annotations?.title?.trim(), `${t.name}: title fehlt`);
  }
});

test('jeder Parameter hat Typ und Beschreibung', () => {
  for (const t of tools) {
    const props = (t.inputSchema.properties ?? {}) as Record<string, Record<string, unknown>>;
    for (const [name, spec] of Object.entries(props)) {
      assert.ok(String(spec.description ?? '').trim(), `${t.name}.${name}: description fehlt`);
      const typed = 'type' in spec || ['$ref', 'anyOf', 'oneOf', 'allOf', 'enum'].some((k) => k in spec);
      assert.ok(typed, `${t.name}.${name}: type fehlt`);
    }
    for (const k of ['oneOf', 'anyOf', 'allOf']) {
      assert.ok(!(k in t.inputSchema) || 'type' in t.inputSchema, `${t.name}: Top-Level-${k} ohne type`);
    }
  }
});

test('Safety-Annotations: readOnlyHint + openWorldHint immer, destructive/idempotent bei schreibenden Tools', () => {
  for (const t of tools) {
    const a = (t.annotations ?? {}) as Record<string, unknown>;
    const required = ['readOnlyHint', 'openWorldHint'];
    if (a.readOnlyHint !== true) required.push('destructiveHint', 'idempotentHint');
    for (const k of required) assert.equal(typeof a[k], 'boolean', `${t.name}: ${k} fehlt`);
  }
});

test('Golden-Datensatz: ≥ 10 Fälle, eindeutige IDs, jedes Gateway-Tool abgedeckt, Tools im Katalog', async () => {
  const { readFile } = await import('node:fs/promises');
  const yaml = await readFile(
    new URL('../../coworker-gateway/datasets/techstack_crawler/cases.yaml', import.meta.url),
    'utf8',
  );
  const ids = [...yaml.matchAll(/^\s*- id:\s*(\S+)/gm)].map((m) => m[1]);
  const expected = [...yaml.matchAll(/^\s*expected_tool:\s*(\S+)/gm)].map((m) => m[1]);
  assert.ok(ids.length >= 10, `nur ${ids.length} Fälle`);
  assert.equal(new Set(ids).size, ids.length, 'doppelte Case-IDs');
  assert.equal(expected.length, ids.length, 'jeder Fall braucht expected_tool');
  for (const tool of expected.filter((t) => t !== 'null')) {
    assert.ok(GATEWAY_TOOLS.includes(tool), `${tool} ist nicht per include_tools freigegeben`);
  }
  for (const tool of GATEWAY_TOOLS) assert.ok(expected.includes(tool), `kein Fall für ${tool}`);
});

test('Annotations spiegeln das Verhalten der Gateway-Tools', () => {
  const ann = (name: string) => tools.find((t) => t.name === name)!.annotations!;
  assert.deepEqual(
    { ...ann('analyze-url') },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  );
  assert.equal(ann('list-analyses').readOnlyHint, true);
  assert.equal(ann('get-analysis').readOnlyHint, true);
  assert.equal(ann('get-analysis').openWorldHint, false);
  assert.equal(ann('use-case-discovery').readOnlyHint, false);
  assert.equal(ann('use-case-discovery').openWorldHint, true);
  for (const t of tools) assert.notEqual(t.annotations?.destructiveHint, true, `${t.name}: kein Tool löscht Daten`);
});

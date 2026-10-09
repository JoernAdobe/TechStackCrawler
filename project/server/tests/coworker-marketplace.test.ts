import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const marketplacePath = new URL('../../coworker-marketplace/.claude-plugin/marketplace.json', import.meta.url);
const marketplaceRoot = new URL('../', marketplacePath);

test('Coworker marketplace points to a matching, installable plugin', async () => {
  const marketplace = JSON.parse(await readFile(marketplacePath, 'utf8')) as {
    name: string;
    owner?: { name?: unknown };
    plugins: Array<{ name: string; source: string; version: string }>;
  };
  assert.equal(marketplace.name, 'techstack-crawler');
  assert.equal(typeof marketplace.owner?.name, 'string');
  assert.equal(marketplace.plugins.length, 1);

  const entry = marketplace.plugins[0];
  assert.equal(entry.name, 'techstack-crawler');
  assert.ok(entry.source.startsWith('./'));

  const pluginRoot = new URL(`${entry.source.replace(/^\.\//, '')}/`, marketplaceRoot);
  const plugin = JSON.parse(await readFile(new URL('.claude-plugin/plugin.json', pluginRoot), 'utf8')) as {
    name: string;
    version: string;
  };
  assert.equal(plugin.name, entry.name);
  assert.equal(plugin.version, entry.version);
  const skill = await readFile(new URL('skills/techstack-analysis/SKILL.md', pluginRoot), 'utf8');
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
  assert.match(frontmatter, /^name: techstack-analysis$/m);
  assert.match(frontmatter, /^description: \S.+$/m);

  const mcp = JSON.parse(await readFile(new URL('.mcp.json', pluginRoot), 'utf8')) as {
    auth_providers: Array<{ name: string; provider: { type: string; headers?: Record<string, string> } }>;
    mcp_servers: { servers: Array<{ name: string; source: string; transport: string; auth: string }> };
  };
  assert.equal(mcp.mcp_servers.servers.length, 1);
  const server = mcp.mcp_servers.servers[0];
  assert.equal(server.name, 'techstack-crawler');
  assert.match(server.source, /^https:\/\/[^/]+\/mcp(\/|\?|$)/);
  assert.equal(server.transport, 'streamable_http');
  const provider = mcp.auth_providers.find((p) => p.name === server.auth)?.provider;
  assert.equal(provider?.type, 'passthrough');
  assert.equal(provider?.headers?.authorization, 'authorization');
  assert.doesNotMatch(JSON.stringify(mcp), /tsa_|Bearer /, 'no static credentials in the plugin');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../../scripts/lib/plugin-config.mjs';
import { MANIFEST_PATHS } from '../../scripts/sync-plugin-pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT = path.join(ROOT, '.antigravity-extension');

test('antigravity config mirrors gemini but renders agents', () => {
  const c = getConfig('antigravity');
  assert.equal(c.pluginDir, '.antigravity-extension');
  assert.equal(c.slashCommandsPlatform, 'gemini-cli');
  assert.equal(c.agentPlatform, 'gemini-cli'); // the KEY divergence from gemini
  assert.equal(c.skillsDir, 'agents/skills/gemini-cli');
  assert.equal(c.commandExt, '.toml');
  assert.equal(c.generateCommands, true);
  assert.equal(c.generateAgents, true);
  assert.equal(c.generateHooks, false);
  assert.equal(c.hooksCommandTemplate, undefined);
});

test('hand-authored manifests exist with the verified MCP location + shape', () => {
  const mcp = JSON.parse(readFileSync(path.join(EXT, 'config', 'mcp_config.json'), 'utf8'));
  assert.ok(
    mcp.mcpServers?.harness?.args?.some((a) => String(a).startsWith('@harness-engineering/cli@')),
    'mcp_config.json must carry the pinned npx form'
  );
  const plugin = JSON.parse(readFileSync(path.join(EXT, 'plugin.json'), 'utf8'));
  assert.equal(plugin.name, 'harness-antigravity');
  assert.equal(plugin.mcpServers, undefined, 'MCP must not live in the manifest (agy ignores it)');
  const market = JSON.parse(readFileSync(path.join(EXT, 'marketplace.json'), 'utf8'));
  assert.ok(market.plugins?.some((p) => p.name === 'harness-antigravity'));
});

test('mcp_config.json is registered for pin-sync', () => {
  assert.ok(MANIFEST_PATHS.includes('.antigravity-extension/config/mcp_config.json'));
});

test('generated commands + agents trees exist', () => {
  const cmds = readdirSync(path.join(EXT, 'commands')).filter((f) => f.endsWith('.toml'));
  assert.ok(cmds.length > 0, 'expected commands/*.toml');
  const agents = readdirSync(path.join(EXT, 'agents')).filter((f) => f.endsWith('.md'));
  assert.ok(agents.length > 0, 'expected agents/*.md');
});

test('sibling target dirs remain present (additive-only change)', () => {
  for (const dir of ['.claude-plugin', '.cursor-plugin', '.gemini-extension', '.codex-plugin']) {
    assert.ok(existsSync(path.join(ROOT, dir)), `${dir} must still exist`);
  }
});

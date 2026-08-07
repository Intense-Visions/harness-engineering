/**
 * Coverage for the `antigravity` (agy) plugin-generator target added for #979.
 *
 * Mirrors how the other targets are exercised: it asserts the target's config
 * shape in scripts/lib/plugin-config.mjs and that the committed
 * .antigravity-extension/ tree carries the expected artifacts (commands/*.toml,
 * agents/*.md, config/mcp_config.json, plugin.json, marketplace.json). It also
 * asserts the pre-existing targets' artifacts are still present — a new target
 * must ADD files, never empty a sibling's tree.
 *
 * Run with: node --test tests/scripts/plugin-antigravity-target.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLUGIN_CONFIGS, getConfig } from '../../scripts/lib/plugin-config.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AGY_DIR = path.join(REPO_ROOT, '.antigravity-extension');

test('antigravity is a registered plugin target', () => {
  assert.ok(PLUGIN_CONFIGS.antigravity, 'PLUGIN_CONFIGS.antigravity should exist');
  assert.equal(getConfig('antigravity'), PLUGIN_CONFIGS.antigravity);
});

test('antigravity target config matches the agy contract (#979)', () => {
  const cfg = getConfig('antigravity');
  assert.equal(cfg.pluginDir, '.antigravity-extension');
  // agy reuses gemini-cli's TOML commands and shares the ~/.gemini/ skill tree.
  assert.equal(cfg.slashCommandsPlatform, 'gemini-cli');
  assert.equal(cfg.skillsDir, 'agents/skills/gemini-cli');
  assert.equal(cfg.commandExt, '.toml');
  assert.equal(cfg.generateCommands, true);
  // Unlike the gemini *extension* target, agy natively reads persona agents.
  assert.equal(cfg.agentPlatform, 'gemini-cli');
  assert.equal(cfg.generateAgents, true);
  // Hooks are a deferred Phase 2 (different stdin/stdout contract) — no hooks yet.
  assert.equal(cfg.generateHooks, false);
  assert.equal(cfg.hooksCommandTemplate, undefined);
});

test('antigravity target emits the expected artifact tree', () => {
  const commandsDir = path.join(AGY_DIR, 'commands');
  const agentsDir = path.join(AGY_DIR, 'agents');

  const commands = readdirSync(commandsDir).filter((f) => f.endsWith('.toml'));
  assert.ok(commands.length > 0, 'expected generated .toml slash commands');

  const agents = readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
  assert.ok(agents.length > 0, 'expected generated .md persona agents');

  assert.ok(existsSync(path.join(AGY_DIR, 'plugin.json')), 'plugin.json missing');
  assert.ok(existsSync(path.join(AGY_DIR, 'marketplace.json')), 'marketplace.json missing');
});

test('antigravity MCP config uses the empirically-verified agy shape and location', () => {
  // agy reads MCP from config/mcp_config.json (declaring it in settings.json is ignored).
  const mcpPath = path.join(AGY_DIR, 'config', 'mcp_config.json');
  assert.ok(existsSync(mcpPath), 'config/mcp_config.json missing');
  const mcp = JSON.parse(readFileSync(mcpPath, 'utf8'));
  assert.ok(mcp.mcpServers, 'mcp_config.json must declare mcpServers');
  assert.ok(mcp.mcpServers.harness, 'mcp_config.json must declare the harness server');
});

test('adding antigravity did not empty the sibling targets', () => {
  // The gemini and claude targets must still carry their generated artifacts —
  // a new target adds files, it must not prune an existing sibling's tree.
  const geminiCommands = readdirSync(path.join(REPO_ROOT, '.gemini-extension', 'commands')).filter(
    (f) => f.endsWith('.toml')
  );
  assert.ok(geminiCommands.length > 0, 'gemini-extension commands should be intact');

  const claudeCommands = readdirSync(path.join(REPO_ROOT, '.claude-plugin', 'commands')).filter(
    (f) => f.endsWith('.md')
  );
  assert.ok(claudeCommands.length > 0, 'claude-plugin commands should be intact');
});

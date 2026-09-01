import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  toolDefinitionText,
  mcpToolEntries,
  agentsMdEntry,
  hooksEntry,
  skillTreeEntries,
  gatherContextSurface,
} from './context-surface';
import { CORE_TOOL_NAMES, STANDARD_TOOL_NAMES } from './tool-tiers';
import type { ToolDefinition } from './tool-types';

/**
 * Behavior contract for the MCP context-surface gatherer (`harness mcp
 * context-report`). Characterizes the CURRENT output SHAPE of each surface
 * source: tool-schema serialization, per-tier filtering, the always-loaded vs
 * invoked-only context classes, and the best-effort file readers (AGENTS.md,
 * hooks, skill trees) with their present/absent/malformed fall-throughs.
 *
 * Uses injected tool definitions + a real temp project root, so no live MCP
 * registry or repo layout is required. Behavior characterized as-is.
 */

const coreName = CORE_TOOL_NAMES[0]!;
const standardExtra = STANDARD_TOOL_NAMES.find((n) => !CORE_TOOL_NAMES.includes(n))!;

function def(name: string): ToolDefinition {
  return {
    name,
    description: `desc for ${name}`,
    inputSchema: { type: 'object', properties: {} },
  } as ToolDefinition;
}

const defs: ToolDefinition[] = [def(coreName), def(standardExtra), def('zzz_full_only')];

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ctx-surface-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('toolDefinitionText', () => {
  it('serializes name, description, and JSON schema an agent pays for', () => {
    const text = toolDefinitionText(def('my_tool'));
    expect(text).toContain('my_tool');
    expect(text).toContain('desc for my_tool');
    expect(text).toContain(JSON.stringify({ type: 'object', properties: {} }));
  });
});

describe('mcpToolEntries — tier filtering + entry shape', () => {
  it('includes every definition at the full tier as always-loaded entries', () => {
    const entries = mcpToolEntries('full', defs);
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.contextClass === 'always-loaded')).toBe(true);
    const core = entries.find((e) => e.id === `mcp:${coreName}`)!;
    expect(core.label).toBe(`MCP tool schema: ${coreName}`);
    expect(core.text).toContain(coreName);
  });

  it('restricts to the core allow-list at the core tier', () => {
    const entries = mcpToolEntries('core', defs);
    expect(entries.map((e) => e.id)).toEqual([`mcp:${coreName}`]);
  });

  it('includes the standard extra at the standard tier but not full-only tools', () => {
    const ids = mcpToolEntries('standard', defs).map((e) => e.id);
    expect(ids).toContain(`mcp:${coreName}`);
    expect(ids).toContain(`mcp:${standardExtra}`);
    expect(ids).not.toContain('mcp:zzz_full_only');
  });
});

describe('agentsMdEntry', () => {
  it('returns an always-loaded entry when AGENTS.md exists', () => {
    writeFileSync(join(root, 'AGENTS.md'), '# agents\nbody');
    const entry = agentsMdEntry(root);
    expect(entry).toMatchObject({ id: 'agents-md', contextClass: 'always-loaded' });
    expect(entry?.text).toContain('body');
  });

  it('returns null when AGENTS.md is absent', () => {
    expect(agentsMdEntry(root)).toBeNull();
  });
});

describe('hooksEntry', () => {
  it('returns a hooks entry containing only the serialized hooks block', () => {
    mkdirSync(join(root, '.claude'));
    writeFileSync(
      join(root, '.claude', 'settings.json'),
      JSON.stringify({ hooks: { PreToolUse: [1] }, other: 'ignored' })
    );
    const entry = hooksEntry(root);
    expect(entry).toMatchObject({ id: 'hooks', contextClass: 'always-loaded' });
    expect(entry?.text).toContain('PreToolUse');
    expect(entry?.text).not.toContain('ignored');
  });

  it('returns null when settings.json has no hooks key', () => {
    mkdirSync(join(root, '.claude'));
    writeFileSync(join(root, '.claude', 'settings.json'), JSON.stringify({ model: 'x' }));
    expect(hooksEntry(root)).toBeNull();
  });

  it('returns null on malformed settings.json', () => {
    mkdirSync(join(root, '.claude'));
    writeFileSync(join(root, '.claude', 'settings.json'), '{not json');
    expect(hooksEntry(root)).toBeNull();
  });

  it('returns null when settings.json is absent', () => {
    expect(hooksEntry(root)).toBeNull();
  });
});

describe('skillTreeEntries', () => {
  it('emits one invoked-only entry per platform with a SKILL.md count', () => {
    const dir = join(root, 'agents', 'skills', 'claude-code', 'my-skill');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), 'skill body');
    const nested = join(dir, 'sub');
    mkdirSync(nested);
    writeFileSync(join(nested, 'SKILL.md'), 'sub skill');

    const entries = skillTreeEntries(root);
    const cc = entries.find((e) => e.id === 'skills:claude-code')!;
    expect(cc.contextClass).toBe('invoked-only');
    expect(cc.label).toBe('Skill tree: claude-code (2 SKILL.md)');
    expect(cc.text).toContain('skill body');
    expect(cc.text).toContain('sub skill');
  });

  it('skips a platform tree that has no SKILL.md files', () => {
    expect(skillTreeEntries(root)).toEqual([]);
  });
});

describe('gatherContextSurface — composition', () => {
  it('composes tool schemas, AGENTS.md, hooks, and skill trees', () => {
    writeFileSync(join(root, 'AGENTS.md'), 'agents');
    mkdirSync(join(root, '.claude'));
    writeFileSync(join(root, '.claude', 'settings.json'), JSON.stringify({ hooks: { a: 1 } }));
    const dir = join(root, 'agents', 'skills', 'codex', 's');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), 'x');

    const entries = gatherContextSurface(root, { tier: 'full', definitions: defs });
    const ids = entries.map((e) => e.id);
    expect(ids).toContain('agents-md');
    expect(ids).toContain('hooks');
    expect(ids).toContain('skills:codex');
    expect(ids).toContain(`mcp:${coreName}`);
  });

  it('omits skill trees when includeSkills is false', () => {
    const dir = join(root, 'agents', 'skills', 'codex', 's');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), 'x');

    const entries = gatherContextSurface(root, { definitions: defs, includeSkills: false });
    expect(entries.some((e) => e.id.startsWith('skills:'))).toBe(false);
  });
});

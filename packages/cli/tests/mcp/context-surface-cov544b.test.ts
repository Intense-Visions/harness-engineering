import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { join } from 'node:path';
import {
  mcpToolEntries,
  skillTreeEntries,
  agentsMdEntry,
  hooksEntry,
  gatherContextSurface,
} from '../../src/mcp/context-surface';
import type { ToolDefinition } from '../../src/mcp/tool-types';
import { STANDARD_TOOL_NAMES } from '../../src/mcp/tool-tiers';

// -----------------------------------------------------------------------------
// context-surface-cov544b — branch-coverage lift for src/mcp/context-surface.ts.
// Targets the filesystem-backed helpers the existing suite skips: skillTreeEntries
// (populated tree + node_modules skip + nested recursion + empty tree), agentsMdEntry
// (present / absent), hooksEntry (with hooks / no hooks key / malformed / absent),
// the standard-tier tool filter, and gatherContextSurface's includeSkills branch.
// -----------------------------------------------------------------------------

const fakeDefs: ToolDefinition[] = [
  { name: 'validate_project', description: 'validate', inputSchema: { type: 'object' } },
  { name: 'init_project', description: 'init', inputSchema: { type: 'object' } },
  { name: 'design_craft', description: 'craft', inputSchema: { type: 'object' } },
];

describe('mcpToolEntries — standard tier filter', () => {
  it('restricts to the standard allow-list', () => {
    const entries = mcpToolEntries('standard', fakeDefs);
    const names = entries.map((e) => e.id.replace('mcp:', ''));
    for (const n of names) expect(STANDARD_TOOL_NAMES).toContain(n);
    // At least validate_project is a standard tool.
    expect(names).toContain('validate_project');
  });
});

describe('skillTreeEntries', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(join(os.tmpdir(), 'ctx-surface-skills-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function writeSkill(platform: string, ...segments: string[]): void {
    const dir = join(root, 'agents', 'skills', platform, ...segments);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(join(dir, 'SKILL.md'), `# skill ${platform}/${segments.join('/')}\n`, 'utf-8');
  }

  it('aggregates SKILL.md bodies per platform, recursing and skipping node_modules', () => {
    writeSkill('claude-code', 'alpha');
    writeSkill('claude-code', 'nested', 'beta'); // nested recursion
    // A SKILL.md under node_modules must be ignored.
    const nm = join(root, 'agents', 'skills', 'claude-code', 'node_modules', 'pkg');
    fs.mkdirSync(nm, { recursive: true });
    fs.writeFileSync(join(nm, 'SKILL.md'), 'IGNORED\n', 'utf-8');

    const entries = skillTreeEntries(root);
    const cc = entries.find((e) => e.id === 'skills:claude-code');
    expect(cc).toBeDefined();
    expect(cc!.contextClass).toBe('invoked-only');
    // Two real SKILL.md files counted; the node_modules one excluded.
    expect(cc!.label).toContain('(2 SKILL.md)');
    expect(cc!.text).not.toContain('IGNORED');
    expect(cc!.text).toContain('skill claude-code/alpha');
  });

  it('emits no entry for a platform tree with no SKILL.md files', () => {
    // Only create an empty directory for one platform.
    fs.mkdirSync(join(root, 'agents', 'skills', 'codex'), { recursive: true });
    const entries = skillTreeEntries(root);
    expect(entries.find((e) => e.id === 'skills:codex')).toBeUndefined();
  });
});

describe('agentsMdEntry', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(join(os.tmpdir(), 'ctx-surface-agents-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('returns an always-loaded entry when AGENTS.md exists', () => {
    fs.writeFileSync(join(root, 'AGENTS.md'), '# Agents map\n', 'utf-8');
    const entry = agentsMdEntry(root);
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe('agents-md');
    expect(entry!.contextClass).toBe('always-loaded');
    expect(entry!.text).toContain('Agents map');
  });

  it('returns null when AGENTS.md is absent', () => {
    expect(agentsMdEntry(root)).toBeNull();
  });
});

describe('hooksEntry', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(join(os.tmpdir(), 'ctx-surface-hooks-'));
    fs.mkdirSync(join(root, '.claude'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const settingsPath = () => join(root, '.claude', 'settings.json');

  it('returns the serialized hooks block when present', () => {
    fs.writeFileSync(
      settingsPath(),
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash' }] }, other: 1 }),
      'utf-8'
    );
    const entry = hooksEntry(root);
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe('hooks');
    expect(entry!.contextClass).toBe('always-loaded');
    expect(entry!.text).toContain('PreToolUse');
    // Only the hooks sub-object is serialized, not `other`.
    expect(entry!.text).not.toContain('"other"');
  });

  it('returns null when settings.json has no hooks key', () => {
    fs.writeFileSync(settingsPath(), JSON.stringify({ model: 'opus' }), 'utf-8');
    expect(hooksEntry(root)).toBeNull();
  });

  it('returns null when settings.json is malformed JSON (parse catch)', () => {
    fs.writeFileSync(settingsPath(), '{ not json', 'utf-8');
    expect(hooksEntry(root)).toBeNull();
  });

  it('returns null when settings.json is absent', () => {
    fs.rmSync(settingsPath(), { force: true });
    expect(hooksEntry(root)).toBeNull();
  });
});

describe('gatherContextSurface — includeSkills + AGENTS.md/hooks assembly', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(join(os.tmpdir(), 'ctx-surface-gather-'));
    fs.writeFileSync(join(root, 'AGENTS.md'), '# Map\n', 'utf-8');
    fs.mkdirSync(join(root, '.claude'), { recursive: true });
    fs.writeFileSync(
      join(root, '.claude', 'settings.json'),
      JSON.stringify({ hooks: { Stop: [] } }),
      'utf-8'
    );
    const skillDir = join(root, 'agents', 'skills', 'cursor', 'demo');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(join(skillDir, 'SKILL.md'), '# cursor demo\n', 'utf-8');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('includes skill-tree entries by default (includeSkills undefined)', () => {
    const entries = gatherContextSurface(root, { definitions: fakeDefs });
    expect(entries.some((e) => e.id.startsWith('mcp:'))).toBe(true);
    expect(entries.some((e) => e.id === 'agents-md')).toBe(true);
    expect(entries.some((e) => e.id === 'hooks')).toBe(true);
    expect(entries.some((e) => e.id === 'skills:cursor')).toBe(true);
  });

  it('omits skill-tree entries when includeSkills is false', () => {
    const entries = gatherContextSurface(root, { definitions: fakeDefs, includeSkills: false });
    expect(entries.some((e) => e.id.startsWith('skills:'))).toBe(false);
    // AGENTS.md + hooks are still gathered.
    expect(entries.some((e) => e.id === 'agents-md')).toBe(true);
    expect(entries.some((e) => e.id === 'hooks')).toBe(true);
  });
});

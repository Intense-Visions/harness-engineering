import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runFallbackRules } from '../../../src/validation/agent-configs/fallback';

/** Make a scratch directory on every test so fixtures cannot cross-contaminate. */
function makeTempRepo(): string {
  return mkdtempSync(join(tmpdir(), 'agent-configs-'));
}

describe('runFallbackRules — CLAUDE.md rules', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = makeTempRepo();
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it('returns empty findings on a clean repo', async () => {
    writeFileSync(join(cwd, 'CLAUDE.md'), '# My Project\n\nNormal-sized guidance.\n');
    const findings = await runFallbackRules(cwd);
    // Clean repo has no CLAUDE.md issues; other checks (skills/hooks) should also be silent.
    expect(findings.filter((f) => f.ruleId.startsWith('HARNESS-AC-00'))).toHaveLength(0);
  });

  it('flags empty CLAUDE.md with HARNESS-AC-002', async () => {
    writeFileSync(join(cwd, 'CLAUDE.md'), '   \n');
    const findings = await runFallbackRules(cwd);
    const rule = findings.find((f) => f.ruleId === 'HARNESS-AC-002');
    expect(rule?.severity).toBe('error');
    expect(rule?.file).toBe('CLAUDE.md');
  });

  it('flags oversize CLAUDE.md with HARNESS-AC-001 error when > 50KB', async () => {
    const big = '# Big\n' + 'x'.repeat(51 * 1024);
    writeFileSync(join(cwd, 'CLAUDE.md'), big);
    const findings = await runFallbackRules(cwd);
    const rule = findings.find((f) => f.ruleId === 'HARNESS-AC-001');
    expect(rule?.severity).toBe('error');
  });

  it('flags CLAUDE.md missing h1 with HARNESS-AC-003', async () => {
    writeFileSync(join(cwd, 'CLAUDE.md'), 'No heading here\n');
    const findings = await runFallbackRules(cwd);
    expect(findings.some((f) => f.ruleId === 'HARNESS-AC-003')).toBe(true);
  });
});

describe('runFallbackRules — agent/persona/skill rules', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = makeTempRepo();
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it('flags agent markdown without frontmatter with HARNESS-AC-010', async () => {
    mkdirSync(join(cwd, 'agents', 'claude-code'), { recursive: true });
    writeFileSync(join(cwd, 'agents', 'claude-code', 'broken.md'), '# broken\n');
    const findings = await runFallbackRules(cwd);
    expect(findings.some((f) => f.ruleId === 'HARNESS-AC-010')).toBe(true);
  });

  it('flags agent frontmatter missing description with HARNESS-AC-012', async () => {
    mkdirSync(join(cwd, 'agents', 'claude-code'), { recursive: true });
    writeFileSync(
      join(cwd, 'agents', 'claude-code', 'agent.md'),
      '---\nname: agent\n---\n# agent\n'
    );
    const findings = await runFallbackRules(cwd);
    const rule = findings.find((f) => f.ruleId === 'HARNESS-AC-012');
    expect(rule?.severity).toBe('error');
  });

  it('flags skill frontmatter missing name with HARNESS-AC-031', async () => {
    mkdirSync(join(cwd, 'agents', 'skills', 'my-skill'), { recursive: true });
    writeFileSync(
      join(cwd, 'agents', 'skills', 'my-skill', 'SKILL.md'),
      '---\ndescription: does things\n---\n# skill\n'
    );
    const findings = await runFallbackRules(cwd);
    expect(findings.some((f) => f.ruleId === 'HARNESS-AC-031')).toBe(true);
  });

  it('flags unreachable skill with HARNESS-AC-030 when no references exist', async () => {
    mkdirSync(join(cwd, 'agents', 'skills', 'orphan-skill'), { recursive: true });
    writeFileSync(
      join(cwd, 'agents', 'skills', 'orphan-skill', 'SKILL.md'),
      '---\nname: orphan-skill\ndescription: demo\n---\n# orphan\n'
    );
    const findings = await runFallbackRules(cwd);
    expect(findings.some((f) => f.ruleId === 'HARNESS-AC-030')).toBe(true);
  });

  it('does not flag reachable skill when a persona references it', async () => {
    mkdirSync(join(cwd, 'agents', 'skills', 'reachable-skill'), { recursive: true });
    writeFileSync(
      join(cwd, 'agents', 'skills', 'reachable-skill', 'SKILL.md'),
      '---\nname: reachable-skill\ndescription: demo\n---\n# reach\n'
    );
    mkdirSync(join(cwd, 'agents', 'personas'), { recursive: true });
    writeFileSync(
      join(cwd, 'agents', 'personas', 'p.yaml'),
      'name: p\nskills:\n  - reachable-skill\n'
    );
    const findings = await runFallbackRules(cwd);
    expect(findings.some((f) => f.ruleId === 'HARNESS-AC-030')).toBe(false);
  });

  it('flags persona referencing missing skill with HARNESS-AC-080', async () => {
    mkdirSync(join(cwd, 'agents', 'personas'), { recursive: true });
    writeFileSync(
      join(cwd, 'agents', 'personas', 'p.yaml'),
      'name: p\nskills:\n  - does-not-exist\n'
    );
    const findings = await runFallbackRules(cwd);
    expect(findings.some((f) => f.ruleId === 'HARNESS-AC-080')).toBe(true);
  });
});

describe('runFallbackRules — hook and settings rules', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = makeTempRepo();
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it('flags missing hook command script with HARNESS-AC-020', async () => {
    mkdirSync(join(cwd, '.claude'), { recursive: true });
    writeFileSync(
      join(cwd, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: 'node hooks/does-not-exist.js' }] }],
        },
      })
    );
    const findings = await runFallbackRules(cwd);
    expect(findings.some((f) => f.ruleId === 'HARNESS-AC-020')).toBe(true);
  });

  it('flags missing hook command in flat array shape (HARNESS-AC-020)', async () => {
    mkdirSync(join(cwd, '.claude'), { recursive: true });
    // Flat array shape: hooks is an array of entries that each carry event + command.
    writeFileSync(
      join(cwd, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: [{ event: 'Stop', command: 'node hooks/nope.js' }],
      })
    );
    const findings = await runFallbackRules(cwd);
    expect(findings.some((f) => f.ruleId === 'HARNESS-AC-020')).toBe(true);
  });

  it('flags unknown hook event with HARNESS-AC-021', async () => {
    mkdirSync(join(cwd, '.claude'), { recursive: true });
    // Existing script to isolate rule-021.
    mkdirSync(join(cwd, 'hooks'), { recursive: true });
    writeFileSync(join(cwd, 'hooks', 'x.js'), 'console.log("ok")\n');
    writeFileSync(
      join(cwd, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: { NonexistentEvent: [{ hooks: [{ type: 'command', command: 'node hooks/x.js' }] }] },
      })
    );
    const findings = await runFallbackRules(cwd);
    expect(findings.some((f) => f.ruleId === 'HARNESS-AC-021')).toBe(true);
  });

  it('flags invalid settings.json with HARNESS-AC-070', async () => {
    mkdirSync(join(cwd, '.claude'), { recursive: true });
    writeFileSync(join(cwd, '.claude', 'settings.json'), '{ not: valid json }');
    const findings = await runFallbackRules(cwd);
    expect(findings.some((f) => f.ruleId === 'HARNESS-AC-070')).toBe(true);
  });

  it('flags MCP server missing command with HARNESS-AC-040', async () => {
    writeFileSync(
      join(cwd, '.mcp.json'),
      JSON.stringify({ mcpServers: { harness: { args: ['mcp'] } } })
    );
    const findings = await runFallbackRules(cwd);
    expect(findings.some((f) => f.ruleId === 'HARNESS-AC-040')).toBe(true);
  });

  it('flags MCP args as non-array with HARNESS-AC-041', async () => {
    writeFileSync(
      join(cwd, '.mcp.json'),
      JSON.stringify({ mcpServers: { harness: { command: 'harness', args: 'mcp' } } })
    );
    const findings = await runFallbackRules(cwd);
    expect(findings.some((f) => f.ruleId === 'HARNESS-AC-041')).toBe(true);
  });
});

describe('runFallbackRules — .agnix.toml rules', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = makeTempRepo();
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it('flags unknown target with HARNESS-AC-091', async () => {
    writeFileSync(join(cwd, '.agnix.toml'), 'target = "nonexistent-tool"\n');
    const findings = await runFallbackRules(cwd);
    expect(findings.some((f) => f.ruleId === 'HARNESS-AC-091')).toBe(true);
  });

  it('flags unparseable TOML with HARNESS-AC-090', async () => {
    writeFileSync(join(cwd, '.agnix.toml'), 'this-is-not-valid-toml\n');
    const findings = await runFallbackRules(cwd);
    expect(findings.some((f) => f.ruleId === 'HARNESS-AC-090')).toBe(true);
  });

  it('stays silent on a valid .agnix.toml', async () => {
    writeFileSync(
      join(cwd, '.agnix.toml'),
      'target = "claude-code"\nstrict = false\nmax_files = 10000\n'
    );
    const findings = await runFallbackRules(cwd);
    expect(findings.some((f) => f.ruleId.startsWith('HARNESS-AC-09'))).toBe(false);
  });
});

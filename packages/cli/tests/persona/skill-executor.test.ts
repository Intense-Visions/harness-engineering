import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { executeSkill, type SkillExecutionContext } from '../../src/persona/skill-executor';

// Create a temp skill directory for tests
let tmpDir: string;
let skillDir: string;

// Mock resolveSkillsDir to point to our temp dir
vi.mock('../../src/utils/paths', () => ({
  resolveSkillsDir: () => {
    // Return the current tmpDir value at call time
    return (globalThis as Record<string, unknown>).__testSkillsDir as string;
  },
}));

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-executor-test-'));
  (globalThis as Record<string, unknown>).__testSkillsDir = tmpDir;
  skillDir = path.join(tmpDir, 'test-skill');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'skill.yaml'),
    `name: test-skill
version: "1.0.0"
description: Test skill
triggers:
  - manual
platforms:
  - claude-code
tools:
  - Read
type: rigid
`
  );
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test Skill\n\nTest content.');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('executeSkill', () => {
  it('returns a result with skill output', async () => {
    const ctx: SkillExecutionContext = {
      trigger: 'on_pr',
      projectPath: tmpDir,
      outputMode: 'inline',
    };
    const result = await executeSkill('test-skill', ctx);
    expect(result.status).toBe('pass');
    expect(result.output).toContain('test-skill');
    expect(result.output).toContain('rigid');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns error for unknown skill', async () => {
    const ctx: SkillExecutionContext = {
      trigger: 'on_pr',
      projectPath: tmpDir,
      outputMode: 'inline',
    };
    const result = await executeSkill('nonexistent-skill', ctx);
    expect(result.status).toBe('fail');
    expect(result.output).toContain('not found');
  });

  it('writes artifact when outputMode is artifact', async () => {
    const ctx: SkillExecutionContext = {
      trigger: 'on_pr',
      projectPath: tmpDir,
      outputMode: 'artifact',
      headSha: 'abc1234567',
    };
    const result = await executeSkill('test-skill', ctx);
    expect(result.status).toBe('pass');
    expect(result.artifactPath).toMatch(/\.harness\/reviews\//);
    expect(result.artifactPath).toContain('abc1234');
    // Verify file was written
    expect(fs.existsSync(result.artifactPath!)).toBe(true);
    const content = fs.readFileSync(result.artifactPath!, 'utf-8');
    expect(content).toContain('skill: test-skill');
    expect(content).toContain('sha: abc1234');
  });

  it('does not write artifact when outputMode is inline', async () => {
    const ctx: SkillExecutionContext = {
      trigger: 'on_pr',
      projectPath: tmpDir,
      outputMode: 'inline',
    };
    const result = await executeSkill('test-skill', ctx);
    expect(result.artifactPath).toBeUndefined();
  });

  it('resolves auto to inline when trigger is manual', async () => {
    const ctx: SkillExecutionContext = {
      trigger: 'manual',
      projectPath: tmpDir,
      outputMode: 'auto',
    };
    const result = await executeSkill('test-skill', ctx);
    expect(result.artifactPath).toBeUndefined();
  });

  it('resolves auto to artifact when trigger is on_pr', async () => {
    const ctx: SkillExecutionContext = {
      trigger: 'on_pr',
      projectPath: tmpDir,
      outputMode: 'auto',
      headSha: 'def5678901',
    };
    const result = await executeSkill('test-skill', ctx);
    expect(result.artifactPath).toBeDefined();
    expect(fs.existsSync(result.artifactPath!)).toBe(true);
  });

  it('returns error when skill.yaml is missing', async () => {
    fs.unlinkSync(path.join(skillDir, 'skill.yaml'));
    const ctx: SkillExecutionContext = {
      trigger: 'on_pr',
      projectPath: tmpDir,
      outputMode: 'inline',
    };
    const result = await executeSkill('test-skill', ctx);
    expect(result.status).toBe('fail');
    expect(result.output).toContain('skill.yaml not found');
  });

  it('returns error when SKILL.md is missing', async () => {
    fs.unlinkSync(path.join(skillDir, 'SKILL.md'));
    const ctx: SkillExecutionContext = {
      trigger: 'on_pr',
      projectPath: tmpDir,
      outputMode: 'inline',
    };
    const result = await executeSkill('test-skill', ctx);
    expect(result.status).toBe('fail');
    expect(result.output).toContain('SKILL.md not found');
  });
});

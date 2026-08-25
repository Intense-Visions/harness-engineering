import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runInstructionDensityAudit } from './instruction-density';

const IMPERATIVE_BLOCK = Array.from({ length: 40 }, (_, i) => `${i + 1}. Run step ${i + 1}`).join(
  '\n'
);

function skillBody(steps: number): string {
  const lines = Array.from({ length: steps }, (_, i) => `${i + 1}. Run step ${i + 1}`).join('\n');
  return `# Skill\n\n> Summary\n\n## Process\n\n${lines}\n`;
}

describe('runInstructionDensityAudit', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'density-audit-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('emits no finding when every level is within budget', async () => {
    const dir = path.join(root, 'skills', 'small');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), skillBody(5));

    const res = await runInstructionDensityAudit({ path: root, budget: 175 });
    expect(res.skillsScanned).toBe(1);
    expect(res.findings).toHaveLength(0);
  });

  it('emits an advisory finding when a level exceeds the budget', async () => {
    const dir = path.join(root, 'skills', 'big');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'SKILL.md'),
      `# Big\n\n> S\n\n## Process\n\n${IMPERATIVE_BLOCK}\n`
    );

    const res = await runInstructionDensityAudit({ path: root, budget: 10 });
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]!.file).toContain('SKILL.md');
    expect(res.findings[0]!.level.overBudget).toBe(true);
    expect(res.findings[0]!.budget).toBe(10);
  });

  it('deduplicates symlinked skill mirrors by real path', async () => {
    const canonical = path.join(root, 'claude-code', 'my-skill');
    fs.mkdirSync(canonical, { recursive: true });
    fs.writeFileSync(path.join(canonical, 'SKILL.md'), skillBody(5));

    // Mirror directory as a symlink (as cursor/codex/gemini-cli skills are wired).
    const mirrorParent = path.join(root, 'cursor');
    fs.mkdirSync(mirrorParent, { recursive: true });
    try {
      fs.symlinkSync(canonical, path.join(mirrorParent, 'my-skill'), 'dir');
    } catch {
      // Some CI environments disallow symlinks; skip the dedup assertion there.
      return;
    }

    const res = await runInstructionDensityAudit({ path: root });
    expect(res.skillsScanned).toBe(1);
  });

  it('defaults the budget to 175 when not supplied', async () => {
    const dir = path.join(root, 's');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), skillBody(3));
    const res = await runInstructionDensityAudit({ path: root });
    expect(res.budget).toBe(175);
  });

  it('skips node_modules', async () => {
    const dir = path.join(root, 'node_modules', 'pkg');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), skillBody(5));
    const res = await runInstructionDensityAudit({ path: root });
    expect(res.skillsScanned).toBe(0);
  });
});

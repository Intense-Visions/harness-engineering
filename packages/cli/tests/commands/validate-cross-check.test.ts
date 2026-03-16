import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runCrossCheck } from '../../src/commands/validate-cross-check';

describe('runCrossCheck', () => {
  it('returns clean result for empty directories', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-check-'));
    const specsDir = path.join(tmpDir, 'docs', 'specs');
    const plansDir = path.join(tmpDir, 'docs', 'plans');
    fs.mkdirSync(specsDir, { recursive: true });
    fs.mkdirSync(plansDir, { recursive: true });

    const result = await runCrossCheck({ specsDir, plansDir, projectPath: tmpDir });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.warnings).toBe(0);
    }
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('detects planned-but-not-built files', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-check-'));
    const plansDir = path.join(tmpDir, 'docs', 'plans');
    fs.mkdirSync(plansDir, { recursive: true });
    fs.writeFileSync(
      path.join(plansDir, 'test-plan.md'),
      ['# Test Plan', '### Task 1: Test', '**Files:**', '- Create: `src/nonexistent.ts`'].join('\n')
    );

    const result = await runCrossCheck({
      specsDir: path.join(tmpDir, 'docs', 'specs'),
      plansDir,
      projectPath: tmpDir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.warnings).toBeGreaterThan(0);
      expect(result.value.planToImpl.some((w) => w.includes('nonexistent.ts'))).toBe(true);
    }
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns no warnings when planned files exist', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-check-'));
    const plansDir = path.join(tmpDir, 'docs', 'plans');
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(plansDir, { recursive: true });
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'existing.ts'), 'export const x = 1;');
    fs.writeFileSync(
      path.join(plansDir, 'test-plan.md'),
      ['# Test Plan', '**Files:**', '- Create: `src/existing.ts`'].join('\n')
    );

    const result = await runCrossCheck({
      specsDir: path.join(tmpDir, 'docs', 'specs'),
      plansDir,
      projectPath: tmpDir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.planToImpl).toHaveLength(0);
    }
    fs.rmSync(tmpDir, { recursive: true });
  });
});

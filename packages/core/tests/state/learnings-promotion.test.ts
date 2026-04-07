import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promoteSessionLearnings, countLearningEntries } from '../../src/state/learnings-lifecycle';

describe('promoteSessionLearnings', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-promote-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should promote generalizable learnings (gotcha, decision) to global', async () => {
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '- **2026-03-25 [skill:harness-execution] [outcome:gotcha]:** Always check null before access',
        '',
        '- **2026-03-25 [skill:harness-execution] [outcome:decision]:** Use Result type over exceptions',
        '',
        '- **2026-03-25 [skill:harness-execution] [outcome:success]:** All 5 tasks completed',
        '',
        '- **2026-03-25 [skill:harness-execution] [outcome:gotcha]:** Pre-commit hook enforces baselines',
        '',
        '- **2026-03-25 [skill:harness-execution] [outcome:success]:** Test count grew from 50 to 65',
        '',
      ].join('\n')
    );

    const result = await promoteSessionLearnings(tmpDir, 'test-session');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.promoted).toBe(3);
      expect(result.value.skipped).toBe(2);
    }

    // Verify global learnings.md was created/updated
    const globalPath = path.join(tmpDir, '.harness', 'learnings.md');
    expect(fs.existsSync(globalPath)).toBe(true);
    const globalContent = fs.readFileSync(globalPath, 'utf-8');
    expect(globalContent).toContain('Always check null before access');
    expect(globalContent).toContain('Use Result type over exceptions');
    expect(globalContent).toContain('Pre-commit hook enforces baselines');
    expect(globalContent).not.toContain('All 5 tasks completed');
    expect(globalContent).not.toContain('Test count grew');
  });

  it('should return zero counts when session has no learnings file', async () => {
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'empty-session');
    fs.mkdirSync(sessionDir, { recursive: true });

    const result = await promoteSessionLearnings(tmpDir, 'empty-session');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.promoted).toBe(0);
      expect(result.value.skipped).toBe(0);
    }
  });

  it('should append to existing global learnings without overwriting', async () => {
    // Existing global
    const globalDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, 'learnings.md'),
      '# Learnings\n\n- **2026-03-20 [skill:harness-planning]:** Existing global entry\n'
    );

    // Session learnings
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, 'learnings.md'),
      '# Learnings\n\n- **2026-03-25 [skill:harness-execution] [outcome:gotcha]:** New gotcha\n'
    );

    const result = await promoteSessionLearnings(tmpDir, 'test-session');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.promoted).toBe(1);
    }

    const globalContent = fs.readFileSync(path.join(globalDir, 'learnings.md'), 'utf-8');
    expect(globalContent).toContain('Existing global entry');
    expect(globalContent).toContain('New gotcha');
  });

  it('should promote entries with outcome:observation tag', async () => {
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, 'learnings.md'),
      '# Learnings\n\n- **2026-03-25 [skill:harness-autopilot] [outcome:observation]:** Patterns repeat across phases\n'
    );

    const result = await promoteSessionLearnings(tmpDir, 'test-session');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.promoted).toBe(1);
    }
  });

  it('should be idempotent — calling twice does not duplicate entries', async () => {
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, 'learnings.md'),
      '# Learnings\n\n- **2026-03-25 [skill:harness-execution] [outcome:gotcha]:** Always check null before access\n'
    );

    const result1 = await promoteSessionLearnings(tmpDir, 'test-session');
    expect(result1.ok).toBe(true);
    if (result1.ok) {
      expect(result1.value.promoted).toBe(1);
    }

    const result2 = await promoteSessionLearnings(tmpDir, 'test-session');
    expect(result2.ok).toBe(true);
    if (result2.ok) {
      expect(result2.value.promoted).toBe(0);
    }

    // Verify entry appears only once in global
    const globalContent = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    const matches = globalContent.match(/Always check null before access/g);
    expect(matches).toHaveLength(1);
  });

  it('should skip entries with no outcome tag (treat as task-specific)', async () => {
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, 'learnings.md'),
      '# Learnings\n\n- **2026-03-25 [skill:harness-execution]:** Task 3 completed\n'
    );

    const result = await promoteSessionLearnings(tmpDir, 'test-session');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.promoted).toBe(0);
      expect(result.value.skipped).toBe(1);
    }
  });
});

describe('countLearningEntries', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-count-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should count all entries in learnings file', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });

    const entries = Array.from(
      { length: 35 },
      (_, i) => `- **2026-03-${String((i % 28) + 1).padStart(2, '0')} [skill:a]:** Learning ${i}`
    );
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      `# Learnings\n\n${entries.join('\n\n')}\n`
    );

    const count = await countLearningEntries(tmpDir);
    expect(count).toBe(35);
  });

  it('should return 0 when no learnings file exists', async () => {
    const count = await countLearningEntries(tmpDir);
    expect(count).toBe(0);
  });

  it('should count heading-based entries too', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '## 2026-03-14 — Task 3: Something',
        '- [learning]: Note one',
        '',
        '- **2026-03-15 [skill:a]:** Bullet entry',
        '',
      ].join('\n')
    );

    const count = await countLearningEntries(tmpDir);
    expect(count).toBe(2);
  });
});

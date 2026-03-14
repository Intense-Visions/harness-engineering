import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { appendLearning, loadRelevantLearnings } from '../../src/state/state-manager';

describe('appendLearning with tags', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should write tagged entry when skillName and outcome provided', async () => {
    const result = await appendLearning(tmpDir, 'UTC normalization needed', 'harness-tdd', 'gotcha');
    expect(result.ok).toBe(true);

    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    expect(content).toContain('[skill:harness-tdd]');
    expect(content).toContain('[outcome:gotcha]');
    expect(content).toContain('UTC normalization needed');
  });

  it('should write untagged entry when no tags provided (backwards compatible)', async () => {
    const result = await appendLearning(tmpDir, 'Simple learning');
    expect(result.ok).toBe(true);

    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    expect(content).not.toContain('[skill:');
    expect(content).toContain('Simple learning');
  });
});

describe('loadRelevantLearnings', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should return empty array when no learnings file exists', async () => {
    const result = await loadRelevantLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('should return all entries when no skill filter', async () => {
    await appendLearning(tmpDir, 'Learning A', 'harness-tdd', 'success');
    await appendLearning(tmpDir, 'Learning B', 'harness-execution', 'gotcha');
    await appendLearning(tmpDir, 'Learning C');

    const result = await loadRelevantLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(3);
    }
  });

  it('should filter by skill name', async () => {
    await appendLearning(tmpDir, 'TDD learning', 'harness-tdd', 'success');
    await appendLearning(tmpDir, 'Execution learning', 'harness-execution', 'gotcha');
    await appendLearning(tmpDir, 'Another TDD', 'harness-tdd', 'gotcha');

    const result = await loadRelevantLearnings(tmpDir, 'harness-tdd');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
      expect(result.value.every(e => e.includes('harness-tdd'))).toBe(true);
    }
  });

  it('should include untagged entries when no filter', async () => {
    await appendLearning(tmpDir, 'Tagged', 'harness-tdd', 'success');
    await appendLearning(tmpDir, 'Untagged');

    const result = await loadRelevantLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });

  it('should handle heading-based format from execution skill', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      '# Learnings\n\n## 2026-03-14 — Task 3: Notification Expiry\n- [learning]: UTC normalization needed\n'
    );

    const result = await loadRelevantLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
    }
  });
});

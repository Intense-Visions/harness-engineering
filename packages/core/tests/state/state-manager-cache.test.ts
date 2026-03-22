import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  loadRelevantLearnings,
  loadFailures,
  appendLearning,
  appendFailure,
  clearLearningsCache,
  clearFailuresCache,
} from '../../src/state/state-manager';

describe('loadRelevantLearnings cache', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cache-'));
    clearLearningsCache();
    clearFailuresCache();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('second call with same mtime returns in <5ms', async () => {
    await appendLearning(tmpDir, 'Learning A', 'harness-tdd', 'success');
    await appendLearning(tmpDir, 'Learning B', 'harness-execution', 'gotcha');

    // First call populates cache
    await loadRelevantLearnings(tmpDir);

    // Second call should be cached
    const start = performance.now();
    const result = await loadRelevantLearnings(tmpDir);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });

  it('cache filters by skill correctly on cached data', async () => {
    await appendLearning(tmpDir, 'TDD learning', 'harness-tdd', 'success');
    await appendLearning(tmpDir, 'Exec learning', 'harness-execution', 'gotcha');

    // Populate cache with unfiltered call
    await loadRelevantLearnings(tmpDir);

    // Filtered call should still work from cache
    const result = await loadRelevantLearnings(tmpDir, 'harness-tdd');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value[0]).toContain('harness-tdd');
    }
  });

  it('invalidates cache when file changes', async () => {
    await appendLearning(tmpDir, 'Learning A');
    const result1 = await loadRelevantLearnings(tmpDir);

    // Append changes mtime
    await appendLearning(tmpDir, 'Learning B');
    const result2 = await loadRelevantLearnings(tmpDir);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (result1.ok && result2.ok) {
      expect(result2.value.length).toBe(result1.value.length + 1);
    }
  });

  it('returns empty array when no file (no cache pollution)', async () => {
    const result = await loadRelevantLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });
});

describe('loadFailures cache', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cache-'));
    clearLearningsCache();
    clearFailuresCache();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('second call with same mtime returns in <5ms', async () => {
    await appendFailure(tmpDir, 'Failure A', 'harness-tdd', 'test-fail');

    // First call
    await loadFailures(tmpDir);

    // Second call should be cached
    const start = performance.now();
    const result = await loadFailures(tmpDir);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
    }
  });

  it('invalidates cache when file changes', async () => {
    await appendFailure(tmpDir, 'Failure A', 'harness-tdd', 'test-fail');
    const result1 = await loadFailures(tmpDir);

    await appendFailure(tmpDir, 'Failure B', 'harness-execution', 'lint-fail');
    const result2 = await loadFailures(tmpDir);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (result1.ok && result2.ok) {
      expect(result2.value.length).toBe(result1.value.length + 1);
    }
  });
});

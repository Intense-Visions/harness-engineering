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
} from '../../src/state';

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

  // The cache's contract is "an unchanged mtime is served from memory, not
  // re-read from disk". This used to be asserted as a wall-clock budget
  // (elapsed < 50ms), which is a function of runner load, not of whether the
  // cache hit (#2046). Assert the property itself: change the file's CONTENT
  // behind the cache's back while pinning its mtime. A cache hit returns the
  // stale in-memory entries; any disk re-read would see the extra entry.
  it('second call with same mtime is served from cache, not re-read from disk', async () => {
    await appendLearning(tmpDir, 'Learning A', 'harness-tdd', 'success');
    await appendLearning(tmpDir, 'Learning B', 'harness-execution', 'gotcha');
    const learningsPath = path.join(tmpDir, '.harness', 'learnings.md');
    // Pin mtime to a whole second so it round-trips exactly through utimes.
    const pinned = new Date(1_700_000_000_000);
    fs.utimesSync(learningsPath, pinned, pinned);

    // First call populates cache
    const first = await loadRelevantLearnings(tmpDir);
    expect(first.ok && first.value.length).toBe(2);

    // Mutate content directly (bypassing appendLearning's invalidation), keep mtime.
    fs.appendFileSync(learningsPath, '\n- **2026-01-01 [skill:harness-tdd]:** Learning C\n');
    fs.utimesSync(learningsPath, pinned, pinned);
    expect(fs.statSync(learningsPath).mtimeMs).toBe(pinned.getTime());

    // Second call should be cached
    const result = await loadRelevantLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok && first.ok) {
      expect(result.value.length).toBe(2);
      expect(result.value).toBe(first.value);
    }

    // Positive control: once mtime moves, the same file IS re-read (3 entries).
    fs.utimesSync(learningsPath, pinned, new Date(pinned.getTime() + 1000));
    const reread = await loadRelevantLearnings(tmpDir);
    expect(reread.ok && reread.value.length).toBe(3);
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

  // See the learnings cache test above: assert the cache-hit property
  // (no disk re-read on an unchanged mtime), not a wall-clock budget (#2046).
  it('second call with same mtime is served from cache, not re-read from disk', async () => {
    await appendFailure(tmpDir, 'Failure A', 'harness-tdd', 'test-fail');
    const failuresPath = path.join(tmpDir, '.harness', 'failures.md');
    const pinned = new Date(1_700_000_000_000);
    fs.utimesSync(failuresPath, pinned, pinned);

    // First call
    const first = await loadFailures(tmpDir);
    expect(first.ok && first.value.length).toBe(1);

    fs.appendFileSync(
      failuresPath,
      '\n- **2026-01-01 [skill:harness-tdd] [type:test-fail]:** Failure B\n'
    );
    fs.utimesSync(failuresPath, pinned, pinned);
    expect(fs.statSync(failuresPath).mtimeMs).toBe(pinned.getTime());

    // Second call should be cached
    const result = await loadFailures(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok && first.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value).toBe(first.value);
    }

    // Positive control: a moved mtime forces a re-read that sees Failure B.
    fs.utimesSync(failuresPath, pinned, new Date(pinned.getTime() + 1000));
    const reread = await loadFailures(tmpDir);
    expect(reread.ok && reread.value.length).toBe(2);
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

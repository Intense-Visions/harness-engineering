import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { appendFailure, archiveFailures, loadFailures } from '../../src/state/state-manager';

describe('archiveFailures', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-archive-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should move failures.md to archive directory', async () => {
    await appendFailure(tmpDir, 'Old failure', 'harness-tdd', 'dead-end');
    const result = await archiveFailures(tmpDir);
    expect(result.ok).toBe(true);

    const archiveDir = path.join(tmpDir, '.harness', 'archive');
    const archiveFiles = fs.readdirSync(archiveDir);
    expect(archiveFiles.length).toBe(1);
    expect(archiveFiles[0]).toMatch(/^failures-\d{4}-\d{2}-\d{2}\.md$/);

    const archiveContent = fs.readFileSync(path.join(archiveDir, archiveFiles[0]), 'utf-8');
    expect(archiveContent).toContain('Old failure');

    const active = await loadFailures(tmpDir);
    expect(active.ok).toBe(true);
    if (active.ok) {
      expect(active.value).toEqual([]);
    }
  });

  it('should handle same-day collision with counter suffix', async () => {
    await appendFailure(tmpDir, 'First batch', 'harness-tdd', 'dead-end');
    await archiveFailures(tmpDir);

    await appendFailure(tmpDir, 'Second batch', 'harness-execution', 'blocked');
    await archiveFailures(tmpDir);

    const archiveDir = path.join(tmpDir, '.harness', 'archive');
    const archiveFiles = fs.readdirSync(archiveDir).sort();
    expect(archiveFiles.length).toBe(2);
    const hasCollisionSuffix = archiveFiles.some(f => /-2\.md$/.test(f));
    expect(hasCollisionSuffix).toBe(true);
  });

  it('should be a no-op when no failures file exists', async () => {
    const result = await archiveFailures(tmpDir);
    expect(result.ok).toBe(true);
  });
});

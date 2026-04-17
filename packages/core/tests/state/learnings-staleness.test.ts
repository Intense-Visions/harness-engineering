import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { detectStaleLearnings } from '../../src/state/learnings-staleness';

describe('detectStaleLearnings', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-staleness-'));
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should detect learning referencing non-existent file', async () => {
    const learningsContent = [
      '# Learnings',
      '',
      '<!-- hash:abc12345 tags:debugging,gotcha -->',
      '- **2026-04-17 [skill:debugging] [outcome:gotcha]:** Fixed bug in src/foo/bar.ts causing crash',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, '.harness', 'learnings.md'), learningsContent);

    const result = await detectStaleLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stale.length).toBe(1);
      expect(result.value.stale[0]!.missingReferences).toContain('src/foo/bar.ts');
    }
  });

  it('should not flag learning referencing existing file', async () => {
    // Create the referenced file
    fs.mkdirSync(path.join(tmpDir, 'src', 'foo'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'foo', 'bar.ts'), 'export const x = 1;');

    const learningsContent = [
      '# Learnings',
      '',
      '<!-- hash:abc12345 -->',
      '- **2026-04-17 [skill:debugging]:** Fixed bug in src/foo/bar.ts',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, '.harness', 'learnings.md'), learningsContent);

    const result = await detectStaleLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stale.length).toBe(0);
      expect(result.value.fresh).toBe(1);
    }
  });

  it('should handle learnings with no file references', async () => {
    const learningsContent = [
      '# Learnings',
      '',
      '<!-- hash:abc12345 -->',
      '- **2026-04-17 [skill:testing]:** Always run tests before committing',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, '.harness', 'learnings.md'), learningsContent);

    const result = await detectStaleLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stale.length).toBe(0);
    }
  });

  it('should return empty report when no learnings file exists', async () => {
    const result = await detectStaleLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.total).toBe(0);
      expect(result.value.stale.length).toBe(0);
    }
  });

  it('should ignore path traversal references (CWE-22)', async () => {
    const learningsContent = [
      '# Learnings',
      '',
      '<!-- hash:abc12345 -->',
      '- **2026-04-17 [skill:debugging]:** Investigated ../../etc/passwd and ../secret/key.ts',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, '.harness', 'learnings.md'), learningsContent);

    const result = await detectStaleLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Path traversal refs are silently skipped, so entry is fresh (no valid missing refs)
      expect(result.value.stale.length).toBe(0);
      expect(result.value.fresh).toBe(1);
    }
  });

  it('should report multiple missing references in one entry', async () => {
    const learningsContent = [
      '# Learnings',
      '',
      '<!-- hash:abc12345 -->',
      '- **2026-04-17 [skill:debugging]:** Changed src/a.ts and src/b.ts to fix issue',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, '.harness', 'learnings.md'), learningsContent);

    const result = await detectStaleLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stale.length).toBe(1);
      expect(result.value.stale[0]!.missingReferences.length).toBe(2);
    }
  });
});

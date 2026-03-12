import { describe, it, expect } from 'vitest';
import { parseDiff, analyzeDiff } from '../../../src/feedback/review/diff-analyzer';

describe('parseDiff()', () => {
  const sampleDiff = `diff --git a/src/index.ts b/src/index.ts
index 1234567..abcdefg 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,7 @@
 import { foo } from './foo';
+import { bar } from './bar';

 export function main() {
+  console.log('hello');
   foo();
+  bar();
 }`;

  it('should parse diff into CodeChanges', () => {
    const result = parseDiff(sampleDiff);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.diff).toBe(sampleDiff);
      expect(result.value.files.length).toBe(1);
      expect(result.value.files[0].path).toBe('src/index.ts');
      expect(result.value.files[0].status).toBe('modified');
      expect(result.value.files[0].additions).toBe(3);
      expect(result.value.files[0].deletions).toBe(0);
    }
  });

  it('should handle added files', () => {
    const addedDiff = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+export function newFunc() {
+  return 42;
+}`;

    const result = parseDiff(addedDiff);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.files[0].status).toBe('added');
    }
  });

  it('should handle deleted files', () => {
    const deletedDiff = `diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index 1234567..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function oldFunc() {
-  return 42;
-}`;

    const result = parseDiff(deletedDiff);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.files[0].status).toBe('deleted');
    }
  });

  it('should handle empty diff', () => {
    const result = parseDiff('');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.files.length).toBe(0);
    }
  });
});

describe('analyzeDiff()', () => {
  it('should detect console.log as forbidden pattern', async () => {
    const changes = {
      diff: '+  console.log("debug");',
      files: [{ path: 'src/index.ts', status: 'modified' as const, additions: 1, deletions: 0 }],
    };

    const result = await analyzeDiff(changes, {
      enabled: true,
      forbiddenPatterns: [
        { pattern: 'console.log', message: 'Remove console.log', severity: 'warning' },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
      expect(result.value.some(item => item.check.includes('console.log'))).toBe(true);
    }
  });

  it('should warn on large PRs', async () => {
    const changes = {
      diff: '',
      files: Array.from({ length: 20 }, (_, i) => ({
        path: `src/file${i}.ts`,
        status: 'modified' as const,
        additions: 50,
        deletions: 10,
      })),
    };

    const result = await analyzeDiff(changes, {
      enabled: true,
      maxChangedFiles: 10,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.some(item => item.check.includes('files'))).toBe(true);
    }
  });

  it('should return empty array when disabled', async () => {
    const changes = {
      diff: '+  console.log("test");',
      files: [{ path: 'src/index.ts', status: 'modified' as const, additions: 1, deletions: 0 }],
    };

    const result = await analyzeDiff(changes, { enabled: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(0);
    }
  });
});

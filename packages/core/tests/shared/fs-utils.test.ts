import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileExists, readFileContent, findFiles } from '../../src/shared/fs-utils';
import { isOk, isErr } from '../../src/shared/result';
import { join } from 'path';

describe('fileExists', () => {
  it('should return true for existing file', async () => {
    const path = join(__dirname, '../fixtures/sample.txt');
    const exists = await fileExists(path);

    expect(exists).toBe(true);
  });

  it('should return false for non-existent file', async () => {
    const path = join(__dirname, '../fixtures/does-not-exist.txt');
    const exists = await fileExists(path);

    expect(exists).toBe(false);
  });
});

describe('readFileContent', () => {
  it('should read file content successfully', async () => {
    const path = join(__dirname, '../fixtures/sample.txt');
    const result = await readFileContent(path);

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('Sample content\n');
    }
  });

  it('should return error for non-existent file', async () => {
    const path = join(__dirname, '../fixtures/does-not-exist.txt');
    const result = await readFileContent(path);

    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });
});

describe('findFiles', () => {
  it('should find files matching pattern', async () => {
    const cwd = join(__dirname, '../fixtures');
    const files = await findFiles('*.txt', cwd);

    expect(files).toHaveLength(1);
    expect(files[0]).toContain('sample.txt');
  });

  it('should return empty array for non-matching pattern', async () => {
    const cwd = join(__dirname, '../fixtures');
    const files = await findFiles('*.nonexistent', cwd);

    expect(files).toHaveLength(0);
  });

  describe('default ignore patterns', () => {
    const fixture = join(__dirname, '../fixtures/fs-utils-default-ignore');

    it('excludes node_modules, dist, build, and coverage by default', async () => {
      const files = await findFiles('**/*.ts', fixture);

      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/src[\\/]code\.ts$/);
      expect(files.some((f) => f.includes('node_modules'))).toBe(false);
      expect(files.some((f) => f.includes('/dist/'))).toBe(false);
      expect(files.some((f) => f.includes('/build/'))).toBe(false);
      expect(files.some((f) => f.includes('/coverage/'))).toBe(false);
    });

    it('extraIgnore patterns extend (do not replace) the defaults', async () => {
      const files = await findFiles('**/*.ts', fixture, ['**/src/**']);

      // src now excluded too; node_modules etc. still excluded
      expect(files).toHaveLength(0);
    });

    it('extraIgnore patterns leave defaults intact when matching unrelated paths', async () => {
      const files = await findFiles('**/*.ts', fixture, ['**/never-matches/**']);

      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/src[\\/]code\.ts$/);
    });
  });

  // #1146: discovery must see first-party source under dot-directories while
  // still excluding the genuine ignore list (.git, node_modules, .harness, ...).
  describe('dot-directory traversal (#1146)', () => {
    let root: string;

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'harness-findfiles-'));
    });

    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it('discovers files under a first-party dot-directory', async () => {
      await mkdir(join(root, '.canary/skills/x'), { recursive: true });
      await writeFile(join(root, '.canary/skills/x/mod.ts'), 'export const a = 1;\n');
      await mkdir(join(root, 'src'), { recursive: true });
      await writeFile(join(root, 'src/main.ts'), 'export const b = 2;\n');

      const files = await findFiles('**/*.ts', root);

      expect(files.some((f) => f.includes('.canary/skills/x/mod.ts'))).toBe(true);
      expect(files.some((f) => f.endsWith('src/main.ts'))).toBe(true);
    });

    it('returns forward-slash (POSIX) paths on every platform', async () => {
      // On Windows glob returns backslash paths; findFiles must normalise so
      // downstream `/`-based matching works cross-platform (#1146).
      await mkdir(join(root, 'src', 'nested'), { recursive: true });
      await writeFile(join(root, 'src', 'nested', 'deep.ts'), 'export const a = 1;\n');

      const files = await findFiles('**/*.ts', root);

      expect(files.length).toBeGreaterThan(0);
      expect(files.every((f) => !f.includes('\\'))).toBe(true);
      expect(files.some((f) => f.endsWith('src/nested/deep.ts'))).toBe(true);
    });

    it('keeps .git, node_modules, and .harness runtime excluded even with dot traversal', async () => {
      await mkdir(join(root, '.git'), { recursive: true });
      await writeFile(join(root, '.git/hook.ts'), 'export const a = 1;\n');
      await mkdir(join(root, 'node_modules/pkg'), { recursive: true });
      await writeFile(join(root, 'node_modules/pkg/dep.ts'), 'export const b = 2;\n');
      await mkdir(join(root, '.harness'), { recursive: true });
      await writeFile(join(root, '.harness/runtime.ts'), 'export const c = 3;\n');
      await mkdir(join(root, '.canary'), { recursive: true });
      await writeFile(join(root, '.canary/keep.ts'), 'export const d = 4;\n');

      const files = await findFiles('**/*.ts', root);

      expect(files.some((f) => f.includes('.canary/keep.ts'))).toBe(true);
      expect(files.some((f) => f.includes('.git/'))).toBe(false);
      expect(files.some((f) => f.includes('node_modules'))).toBe(false);
      expect(files.some((f) => f.includes('.harness/'))).toBe(false);
    });
  });
});

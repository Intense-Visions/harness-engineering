import { describe, it, expect } from 'vitest';
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
});

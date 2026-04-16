import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fss from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { globFiles } from '../../../src/mcp/utils/glob-helper';

describe('globFiles', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fss.mkdtempSync(path.join(os.tmpdir(), 'glob-helper-test-'));
    // Create source files
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'index.ts'), 'export {}');
    await fs.writeFile(path.join(tmpDir, 'src', 'utils.js'), 'module.exports = {}');
    await fs.writeFile(path.join(tmpDir, 'src', 'app.tsx'), '<App/>');
    await fs.writeFile(path.join(tmpDir, 'src', 'helper.jsx'), '<Helper/>');
    // Create test files
    await fs.writeFile(path.join(tmpDir, 'src', 'index.test.ts'), 'test()');
    // Create non-source file
    await fs.writeFile(path.join(tmpDir, 'src', 'readme.md'), '# Readme');
    // Create node_modules (should be skipped)
    await fs.mkdir(path.join(tmpDir, 'node_modules', 'pkg'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'node_modules', 'pkg', 'index.ts'), 'export {}');
    // Create dist (should be skipped)
    await fs.mkdir(path.join(tmpDir, 'dist'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'dist', 'bundle.js'), 'bundled');
    // Create .git dir (should be skipped)
    await fs.mkdir(path.join(tmpDir, '.git'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, '.git', 'config.js'), '');
    // Create python and go files
    await fs.writeFile(path.join(tmpDir, 'src', 'main.py'), 'print("hello")');
    await fs.writeFile(path.join(tmpDir, 'src', 'main.go'), 'package main');
  });

  afterEach(async () => {
    fss.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('finds source files with default excludes', async () => {
    const files = await globFiles(tmpDir);
    const relative = files.map((f) => path.relative(tmpDir, f));
    // Should include source files
    expect(relative).toContain(path.join('src', 'index.ts'));
    expect(relative).toContain(path.join('src', 'utils.js'));
    expect(relative).toContain(path.join('src', 'app.tsx'));
    expect(relative).toContain(path.join('src', 'helper.jsx'));
    expect(relative).toContain(path.join('src', 'main.py'));
    expect(relative).toContain(path.join('src', 'main.go'));
    // Should exclude test files by default
    expect(relative).not.toContain(path.join('src', 'index.test.ts'));
    // Should not include non-source files
    expect(relative).not.toContain(path.join('src', 'readme.md'));
    // Should skip node_modules
    expect(relative).not.toContain(path.join('node_modules', 'pkg', 'index.ts'));
    // Should skip dist
    expect(relative).not.toContain(path.join('dist', 'bundle.js'));
  });

  it('skips node_modules, .git, dist, .next, .nuxt, __pycache__ directories', async () => {
    const files = await globFiles(tmpDir, []);
    const relative = files.map((f) => path.relative(tmpDir, f));
    expect(relative.some((r) => r.startsWith('node_modules'))).toBe(false);
    expect(relative.some((r) => r.startsWith('.git'))).toBe(false);
    expect(relative.some((r) => r.startsWith('dist'))).toBe(false);
  });

  it('respects custom exclude patterns', async () => {
    const files = await globFiles(tmpDir, ['**/utils*']);
    const relative = files.map((f) => path.relative(tmpDir, f));
    expect(relative).not.toContain(path.join('src', 'utils.js'));
    expect(relative).toContain(path.join('src', 'index.ts'));
  });

  it('returns empty array for nonexistent directory', async () => {
    const files = await globFiles('/nonexistent/path/xyz');
    expect(files).toEqual([]);
  });

  it('excludes directories matching exclude patterns', async () => {
    await fs.mkdir(path.join(tmpDir, 'src', 'fixtures'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'fixtures', 'sample.ts'), 'export {}');
    // Default excludes include **/fixtures/** — nested fixtures should be excluded
    const files = await globFiles(tmpDir);
    const relative = files.map((f) => path.relative(tmpDir, f));
    expect(relative).not.toContain(path.join('src', 'fixtures', 'sample.ts'));
  });

  it('handles nested directories', async () => {
    await fs.mkdir(path.join(tmpDir, 'src', 'deep', 'nested'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'deep', 'nested', 'file.ts'), 'export {}');
    const files = await globFiles(tmpDir);
    const relative = files.map((f) => path.relative(tmpDir, f));
    expect(relative).toContain(path.join('src', 'deep', 'nested', 'file.ts'));
  });
});

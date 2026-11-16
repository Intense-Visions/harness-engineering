import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { filesToModules, enumerateModules } from '../../src/comprehension/invalidation';

async function writeFile(
  root: string,
  rel: string,
  content = 'export const x = 1;\n'
): Promise<void> {
  const full = path.join(root, rel);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, content, 'utf-8');
}

describe('filesToModules (SC3 — changed files → owning module directories)', () => {
  it('maps changed files to sorted, de-duplicated owning directories', () => {
    expect(filesToModules(['pkg/a/x.ts', 'pkg/a/y.ts', 'pkg/b/z.ts'])).toEqual(['pkg/a', 'pkg/b']);
  });

  it('drops root-level files (no owning directory) and non-source extensions', () => {
    expect(filesToModules(['README.md', 'pkg/a/data.json', 'pkg/a/x.ts'])).toEqual(['pkg/a']);
  });

  it('returns the owning directory for a supported file', () => {
    expect(filesToModules(['pkg/a/x.ts'])).toEqual(['pkg/a']);
  });

  it('normalizes Windows-style separators to posix', () => {
    expect(filesToModules(['pkg\\a\\x.ts'])).toEqual(['pkg/a']);
  });

  it('SC3 shape: result equals { dirname(f) : f in S, supported(f) } — never repo-wide', () => {
    const changed = ['a/b/one.ts', 'a/b/two.ts', 'c/three.tsx', 'top.ts', 'a/b/notes.md'];
    const result = filesToModules(changed);
    // exactly the owning dirs of the supported, non-root files
    expect(result).toEqual(['a/b', 'c']);
    // never the whole repo: 'top.ts' (root) is excluded, 'notes.md' (non-source) is excluded
    expect(result).not.toContain('');
    expect(result).not.toContain('.');
  });

  it('honors a custom extension set', () => {
    expect(filesToModules(['pkg/a/x.py', 'pkg/b/y.ts'], ['.py'])).toEqual(['pkg/a']);
  });
});

describe('filesToModules ⊆ enumerateModules — one eligibility rule (#2578)', () => {
  let root: string;

  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'module-eligibility-'));
  });
  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true });
  });

  it('drops a changed file under a dot-directory (the VitePress cache orphan)', () => {
    expect(
      filesToModules([
        'docs/.vitepress/cache/deps_temp_9a8fc6ed/chunk.js',
        '.github/scripts/x.ts',
        'pkg/.hidden/y.ts',
      ])
    ).toEqual([]);
  });

  it('drops a changed file under node_modules / dist / build / coverage at any depth', () => {
    expect(
      filesToModules([
        'node_modules/foo/index.js',
        'packages/cli/dist/index.js',
        'pkg/build/out.ts',
        'pkg/coverage/lcov.js',
      ])
    ).toEqual([]);
  });

  it('positive control: a normal module still maps alongside a dropped one', () => {
    expect(filesToModules(['docs/.vitepress/cache/x.js', 'packages/cli/src/a.ts'])).toEqual([
      'packages/cli/src',
    ]);
  });

  it('law: every module --changed would compile is one --all would enumerate', async () => {
    const files = [
      'packages/cli/src/a.ts',
      'docs/.vitepress/cache/deps_temp_9a8fc6ed/chunk.js',
      '.harness/tools/t.ts',
      'node_modules/foo/index.js',
      'pkg/dist/out.js',
      'pkg/lib/z.ts',
    ];
    for (const f of files) await writeFile(root, f);
    const all = new Set(await enumerateModules(root));
    const changed = filesToModules(files);
    expect(changed.length).toBeGreaterThan(0);
    for (const m of changed) expect(all.has(m)).toBe(true);
  });
});

describe('enumerateModules (--all backfill)', () => {
  let root: string;

  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'enumerate-modules-'));
  });
  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true });
  });

  it('returns each directory with >=1 direct source file, skipping node_modules and non-source dirs', async () => {
    await writeFile(root, 'mod/a.ts');
    await writeFile(root, 'mod/sub/b.ts');
    await writeFile(root, 'empty/README.md', '# readme\n');
    await writeFile(root, 'node_modules/pkg/c.ts');
    const mods = await enumerateModules(root);
    expect(mods).toEqual(['mod', 'mod/sub']);
  });

  it('returns posix-normalized, sorted, repo-relative paths', async () => {
    await writeFile(root, 'z/one.ts');
    await writeFile(root, 'a/two.ts');
    const mods = await enumerateModules(root);
    expect(mods).toEqual(['a', 'z']);
    for (const m of mods) expect(m).not.toContain('\\');
  });

  it('returns [] for an absent root (no throw)', async () => {
    const mods = await enumerateModules(path.join(root, 'does-not-exist'));
    expect(mods).toEqual([]);
  });
});

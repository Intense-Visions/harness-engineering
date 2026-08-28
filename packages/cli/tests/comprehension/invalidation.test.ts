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

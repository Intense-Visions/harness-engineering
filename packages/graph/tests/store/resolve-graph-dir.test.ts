import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { afterEach, describe, it, expect } from 'vitest';
import {
  resolveGraphDir,
  localGraphDir,
  findMainWorktreeRoot,
} from '../../src/store/resolve-graph-dir.js';

/**
 * Regression tests for the git-worktree graph bug: `.harness/graph/` is
 * gitignored, so `git worktree add` never materializes it into a linked
 * worktree, and every graph read resolved relative to the worktree saw "No
 * graph found". `resolveGraphDir` lets reads borrow the main worktree's graph
 * while writes stay worktree-local.
 */
describe('resolveGraphDir (git-worktree compatibility)', () => {
  const tmpDirs: string[] = [];
  afterEach(async () => {
    await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  async function tmp(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    tmpDirs.push(dir);
    return dir;
  }

  /** Write a persisted graph (its `graph.json`) into `<root>/.harness/graph`. */
  async function seedGraph(root: string): Promise<string> {
    const graphDir = localGraphDir(root);
    await mkdir(graphDir, { recursive: true });
    await writeFile(join(graphDir, 'graph.json'), '{"kind":"schema"}\n', 'utf8');
    return graphDir;
  }

  /** Make `worktreeRoot` look like a linked worktree of `mainRoot` on disk. */
  async function linkWorktree(mainRoot: string, worktreeRoot: string, name: string): Promise<void> {
    const gitdir = join(mainRoot, '.git', 'worktrees', name);
    await mkdir(gitdir, { recursive: true });
    // git records the common dir relative to the per-worktree gitdir.
    await writeFile(join(gitdir, 'commondir'), '../..\n', 'utf8');
    await mkdir(worktreeRoot, { recursive: true });
    await writeFile(join(worktreeRoot, '.git'), `gitdir: ${gitdir}\n`, 'utf8');
  }

  it('read: prefers the worktree-local graph when it exists', async () => {
    const root = await tmp('wt-local-');
    const local = await seedGraph(root);
    expect(resolveGraphDir(root)).toBe(local);
    expect(resolveGraphDir(root, 'read')).toBe(local);
  });

  it('read: borrows the main worktree graph when the worktree has none', async () => {
    const mainRoot = await tmp('wt-main-');
    const worktreeRoot = await tmp('wt-linked-');
    const mainGraph = await seedGraph(mainRoot);
    await linkWorktree(mainRoot, worktreeRoot, 'feature-x');

    // The worktree has no local graph, so a read borrows the main one.
    expect(resolveGraphDir(worktreeRoot)).toBe(mainGraph);
  });

  it('read: a worktree-local scan takes precedence over the borrowed main graph', async () => {
    const mainRoot = await tmp('wt-main2-');
    const worktreeRoot = await tmp('wt-linked2-');
    await seedGraph(mainRoot);
    await linkWorktree(mainRoot, worktreeRoot, 'feature-y');
    const localGraph = await seedGraph(worktreeRoot); // explicit in-worktree scan

    expect(resolveGraphDir(worktreeRoot)).toBe(localGraph);
  });

  it('write: always targets the worktree-local dir, never the main graph', async () => {
    const mainRoot = await tmp('wt-main3-');
    const worktreeRoot = await tmp('wt-linked3-');
    await seedGraph(mainRoot);
    await linkWorktree(mainRoot, worktreeRoot, 'feature-z');

    // Even with no local graph and a borrowable main graph, writes stay local
    // so a scan never clobbers the main worktree's graph.
    expect(resolveGraphDir(worktreeRoot, 'write')).toBe(localGraphDir(worktreeRoot));
  });

  it('read: falls back to the local dir for a plain checkout with no graph', async () => {
    const root = await tmp('wt-plain-');
    await mkdir(join(root, '.git'), { recursive: true }); // primary worktree: .git is a dir
    expect(resolveGraphDir(root)).toBe(localGraphDir(root));
  });

  it('read: falls back to the local dir when the main worktree also has no graph', async () => {
    const mainRoot = await tmp('wt-main4-');
    const worktreeRoot = await tmp('wt-linked4-');
    await linkWorktree(mainRoot, worktreeRoot, 'feature-w'); // neither side seeded
    expect(resolveGraphDir(worktreeRoot)).toBe(localGraphDir(worktreeRoot));
  });

  describe('findMainWorktreeRoot', () => {
    it('returns null for a primary worktree (.git is a directory)', async () => {
      const root = await tmp('mw-primary-');
      await mkdir(join(root, '.git'), { recursive: true });
      expect(findMainWorktreeRoot(root)).toBeNull();
    });

    it('returns null when there is no .git at all', async () => {
      const root = await tmp('mw-nogit-');
      expect(findMainWorktreeRoot(root)).toBeNull();
    });

    it('resolves the main root from a linked worktree via commondir', async () => {
      const mainRoot = await tmp('mw-main-');
      const worktreeRoot = await tmp('mw-linked-');
      await linkWorktree(mainRoot, worktreeRoot, 'feature-a');
      expect(findMainWorktreeRoot(worktreeRoot)).toBe(mainRoot);
    });

    it('falls back to up-two-levels when commondir is missing', async () => {
      const mainRoot = await tmp('mw-main2-');
      const worktreeRoot = await tmp('mw-linked2-');
      const gitdir = join(mainRoot, '.git', 'worktrees', 'feature-b');
      await mkdir(gitdir, { recursive: true }); // no commondir written
      await writeFile(join(worktreeRoot, '.git'), `gitdir: ${gitdir}\n`, 'utf8');
      expect(findMainWorktreeRoot(worktreeRoot)).toBe(mainRoot);
    });
  });
});

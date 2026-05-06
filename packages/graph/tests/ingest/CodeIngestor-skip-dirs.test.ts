import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js';
import { DEFAULT_SKIP_DIRS } from '../../src/ingest/skip-dirs.js';

/**
 * Regression tests for issue #274 — `harness ingest --source code` OOM/recursion
 * crashes on monorepos with build caches and AI agent sandbox dirs.
 */
describe('CodeIngestor — skip-dirs and exclude config', () => {
  async function buildProject(setup: (root: string) => Promise<void>): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'codeingestor-skip-'));
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'main.ts'), 'export const main = 1;\n');
    await setup(root);
    return root;
  }

  function ingestedPaths(root: string, store: GraphStore): string[] {
    return store
      .findNodes({ type: 'file' })
      .map((n) => n.path ?? '')
      .filter((p) => p.length > 0);
  }

  it('default skip list covers common JS-monorepo cache dirs (issue #274)', async () => {
    // These are the dirs the original bug report flagged as missing from the
    // hardcoded list. None should be walked by the default ingestor.
    const expected = [
      '.turbo',
      '.vite',
      '.cache',
      '.docusaurus',
      '.wrangler',
      'storybook-static',
      'playwright-report',
      'test-results',
      '.pytest_cache',
      '.parcel-cache',
      '.svelte-kit',
      '.pnpm-store',
      '.next',
      '.nuxt',
    ];
    for (const dir of expected) {
      expect(DEFAULT_SKIP_DIRS.has(dir)).toBe(true);
    }
  });

  it('default skip list covers AI agent sandbox dirs (.claude, .cursor, etc.)', async () => {
    // The .claude omission was the highest-impact piece of #274 — Claude Code's
    // worktree feature can multiply walker workload by 50× on heavy users.
    for (const dir of ['.claude', '.cursor', '.codex', '.gemini', '.aider']) {
      expect(DEFAULT_SKIP_DIRS.has(dir)).toBe(true);
    }
  });

  it('does not descend into .claude/worktrees clones', async () => {
    const root = await buildProject(async (r) => {
      // Simulate Claude Code's worktree clone: full repo copy under .claude/worktrees
      await mkdir(join(r, '.claude', 'worktrees', 'session-1', 'src'), { recursive: true });
      await writeFile(join(r, '.claude', 'worktrees', 'session-1', 'src', 'leaked.ts'), 'x;\n');
    });
    const store = new GraphStore();
    await new CodeIngestor(store).ingest(root);
    const paths = ingestedPaths(root, store);
    expect(paths).toContain('src/main.ts');
    expect(paths.some((p) => p.includes('.claude/worktrees'))).toBe(false);
  });

  it('does not descend into .turbo, .vite, or .next caches', async () => {
    const root = await buildProject(async (r) => {
      await mkdir(join(r, '.turbo', 'cache'), { recursive: true });
      await writeFile(join(r, '.turbo', 'cache', 'cached.ts'), 'x;\n');
      await mkdir(join(r, '.vite', 'deps'), { recursive: true });
      await writeFile(join(r, '.vite', 'deps', 'dep.js'), 'x;\n');
      await mkdir(join(r, '.next', 'cache'), { recursive: true });
      await writeFile(join(r, '.next', 'cache', 'page.js'), 'x;\n');
    });
    const store = new GraphStore();
    await new CodeIngestor(store).ingest(root);
    const paths = ingestedPaths(root, store);
    expect(paths.some((p) => p.startsWith('.turbo/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('.vite/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('.next/'))).toBe(false);
  });

  it('respects `additionalSkipDirs` for project-specific cache dirs', async () => {
    const root = await buildProject(async (r) => {
      await mkdir(join(r, 'my-custom-cache'), { recursive: true });
      await writeFile(join(r, 'my-custom-cache', 'a.ts'), 'x;\n');
    });
    const store = new GraphStore();
    await new CodeIngestor(store, { additionalSkipDirs: ['my-custom-cache'] }).ingest(root);
    const paths = ingestedPaths(root, store);
    expect(paths).toContain('src/main.ts');
    expect(paths.some((p) => p.startsWith('my-custom-cache/'))).toBe(false);
  });

  it('`skipDirs` replaces the default set entirely', async () => {
    const root = await buildProject(async (r) => {
      // Normally skipped — but with override, walker should descend.
      await mkdir(join(r, 'dist'), { recursive: true });
      await writeFile(join(r, 'dist', 'compiled.ts'), 'x;\n');
      // Custom override entry — should be skipped.
      await mkdir(join(r, 'only-skip-me'), { recursive: true });
      await writeFile(join(r, 'only-skip-me', 'x.ts'), 'x;\n');
    });
    const store = new GraphStore();
    await new CodeIngestor(store, { skipDirs: ['only-skip-me'] }).ingest(root);
    const paths = ingestedPaths(root, store);
    expect(paths).toContain('src/main.ts');
    expect(paths).toContain('dist/compiled.ts'); // no longer skipped
    expect(paths.some((p) => p.startsWith('only-skip-me/'))).toBe(false);
  });

  it('respects `excludePatterns` glob entries', async () => {
    const root = await buildProject(async (r) => {
      await mkdir(join(r, 'apps', 'legacy'), { recursive: true });
      await writeFile(join(r, 'apps', 'legacy', 'old.ts'), 'x;\n');
      await mkdir(join(r, 'apps', 'modern'), { recursive: true });
      await writeFile(join(r, 'apps', 'modern', 'new.ts'), 'x;\n');
    });
    const store = new GraphStore();
    await new CodeIngestor(store, { excludePatterns: ['apps/legacy/**'] }).ingest(root);
    const paths = ingestedPaths(root, store);
    expect(paths).toContain('apps/modern/new.ts');
    expect(paths.some((p) => p.startsWith('apps/legacy/'))).toBe(false);
  });

  it('`respectGitignore: true` honors .gitignore line patterns', async () => {
    const root = await buildProject(async (r) => {
      await writeFile(join(r, '.gitignore'), 'private/\n*.gen.ts\n');
      await mkdir(join(r, 'private', 'inner'), { recursive: true });
      await writeFile(join(r, 'private', 'inner', 'secret.ts'), 'x;\n');
      await writeFile(join(r, 'src', 'thing.gen.ts'), 'x;\n');
      await writeFile(join(r, 'src', 'kept.ts'), 'x;\n');
    });
    const store = new GraphStore();
    await new CodeIngestor(store, { respectGitignore: true }).ingest(root);
    const paths = ingestedPaths(root, store);
    expect(paths).toContain('src/main.ts');
    expect(paths).toContain('src/kept.ts');
    expect(paths.some((p) => p.startsWith('private/'))).toBe(false);
    expect(paths.some((p) => p.endsWith('.gen.ts'))).toBe(false);
  });

  it('`respectGitignore: false` ingests files .gitignore would have excluded', async () => {
    const root = await buildProject(async (r) => {
      await writeFile(join(r, '.gitignore'), 'private/\n');
      await mkdir(join(r, 'private'), { recursive: true });
      await writeFile(join(r, 'private', 'sneak.ts'), 'x;\n');
    });
    const store = new GraphStore();
    await new CodeIngestor(store, { respectGitignore: false }).ingest(root);
    const paths = ingestedPaths(root, store);
    expect(paths).toContain('private/sneak.ts');
  });

  it('iterative walker handles deeply nested directories without stack overflow', async () => {
    const root = await buildProject(async (r) => {
      // 60 levels with single-character segment names — exercises iteration
      // without bumping into POSIX path-length limits (typically 1024 chars).
      // The previous recursive walker burned one stack frame per level; the
      // iterative replacement should walk this without issue.
      let dir = join(r, 'd');
      for (let i = 0; i < 60; i++) {
        dir = join(dir, 'a');
      }
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'leaf.ts'), 'export const leaf = true;\n');
    });
    const store = new GraphStore();
    await new CodeIngestor(store).ingest(root);
    const paths = ingestedPaths(root, store);
    expect(paths.some((p) => p.endsWith('leaf.ts'))).toBe(true);
  });
});

describe('CodeIngestor', () => {
  let store: GraphStore;
  beforeEach(() => {
    store = new GraphStore();
  });

  it('still ingests the standard sample fixture (smoke check)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codeingestor-smoke-'));
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'index.ts'), 'export function hello() { return 1; }\n');
    await new CodeIngestor(store).ingest(root);
    expect(store.findNodes({ type: 'function' }).length).toBeGreaterThanOrEqual(1);
  });
});

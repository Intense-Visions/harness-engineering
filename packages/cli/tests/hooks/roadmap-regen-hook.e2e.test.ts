import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serializeShard, serializeMeta, parseRoadmap } from '@harness-engineering/core';
import type { Shard, RoadmapMeta } from '@harness-engineering/core';

/**
 * End-to-end proof of the `.husky/pre-commit` roadmap-regen block's FAIL-SAFE
 * behaviour (the Phase-3 e2e originally only covered the happy path).
 *
 * The block this test exercises is extracted verbatim from the committed
 * `.husky/pre-commit` — only the relative built-CLI path is rewritten to an
 * absolute one so it resolves from a throwaway repo cwd. Running the real block
 * (not a hand-rewritten copy) means a regression back to the swallowing
 * `... regen >/dev/null 2>&1 || true; git add docs/roadmap.md || true` form
 * fails this test.
 *
 * Why it matters for Phase 7 (destructive dogfood migration): if `harness
 * roadmap regen` fails while shards are staged, the OLD block swallowed the
 * error and re-staged a STALE `docs/roadmap.md`, silently committing a roadmap
 * that no longer matches the shards. The fixed block must instead BLOCK the
 * commit (exit nonzero) and never re-stage a stale aggregate.
 */

function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('Could not locate monorepo root (pnpm-workspace.yaml not found)');
    }
    dir = parent;
  }
}

/**
 * Extract the roadmap-regen block from the real `.husky/pre-commit` (the last
 * block, guarded by the `^docs/roadmap\.d/` staged-shard grep) and point its
 * `harness` invocation at the absolute built CLI so it runs from any cwd.
 */
function buildPreCommitHook(repoRoot: string): string {
  const hookSrc = fs.readFileSync(path.join(repoRoot, '.husky', 'pre-commit'), 'utf-8');
  const lines = hookSrc.split('\n');
  const startIdx = lines.findIndex((l) => l.includes('docs/roadmap\\.d/'));
  if (startIdx === -1) {
    throw new Error('roadmap-regen guard line not found in .husky/pre-commit');
  }
  const block = lines.slice(startIdx).join('\n');
  const absCli = path.join(repoRoot, 'packages', 'cli', 'dist', 'bin', 'harness.js');
  const rewritten = block.replaceAll('packages/cli/dist/bin/harness.js', absCli);
  return `#!/bin/sh\n${rewritten}\n`;
}

const META: RoadmapMeta = {
  frontmatter: {
    project: 'hook-e2e',
    version: 1,
    lastSynced: '2026-06-27T00:00:00Z',
    lastManualEdit: '2026-06-27T00:00:00Z',
  },
  milestones: ['MVP Release'],
};

const SHARD_ALPHA: Shard = {
  slug: 'alpha',
  milestone: 'MVP Release',
  order: 0,
  feature: {
    name: 'Alpha',
    status: 'planned',
    spec: null,
    plans: [],
    blockedBy: [],
    summary: 'Alpha summary',
    assignee: null,
    priority: 'P1',
    // 1-digit issue ref keeps fixtures clear of the hex-color false positive.
    externalId: 'github:o/r#7',
    updatedAt: null,
  },
};

let repoRoot: string;
let cwd: string;

function git(args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

beforeEach(() => {
  repoRoot = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-hook-e2e-'));

  git(['init', '-q']);
  git(['config', 'user.email', 't@example.com']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);

  // Install ONLY the roadmap-regen block as the temp repo's pre-commit hook.
  const hookPath = path.join(cwd, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hookPath, buildPreCommitHook(repoRoot));
  fs.chmodSync(hookPath, 0o755);

  // Baseline commit (no shard staged → the guard is a no-op here).
  fs.mkdirSync(path.join(cwd, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'docs', 'roadmap.md'), '# Roadmap (baseline placeholder)\n');
  fs.writeFileSync(path.join(cwd, 'README.md'), '# scratch\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'baseline']);
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe('pre-commit roadmap-regen block (e2e)', () => {
  it('BLOCKS the commit and does not re-stage a stale roadmap.md when regen fails', () => {
    const headBefore = git(['rev-parse', 'HEAD']).trim();
    const staleRoadmap = fs.readFileSync(path.join(cwd, 'docs', 'roadmap.md'), 'utf-8');

    // A malformed shard (no frontmatter → no slug) makes `harness roadmap regen`
    // exit nonzero and leave docs/roadmap.md untouched (stale).
    const shardDir = path.join(cwd, 'docs', 'roadmap.d');
    fs.mkdirSync(shardDir, { recursive: true });
    fs.writeFileSync(path.join(shardDir, 'bad.md'), 'this is not a valid shard\n');
    git(['add', 'docs/roadmap.d/bad.md']);

    let failed = false;
    let output = '';
    try {
      git(['commit', '-m', 'attempt to commit a malformed shard']);
    } catch (err) {
      failed = true;
      const e = err as { stdout?: string; stderr?: string };
      output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }

    // 1. The hook blocked the commit (nonzero exit).
    expect(failed).toBe(true);
    expect(output).toContain('Commit blocked');

    // 2. No commit was created — the stale aggregate was NOT committed.
    expect(git(['rev-parse', 'HEAD']).trim()).toBe(headBefore);

    // 3. The malformed shard is absent from history (no new commit at all).
    const tree = git(['ls-tree', '-r', '--name-only', 'HEAD']);
    expect(tree).not.toContain('docs/roadmap.d/bad.md');

    // 4. docs/roadmap.md on disk is untouched (regen left it alone on failure).
    expect(fs.readFileSync(path.join(cwd, 'docs', 'roadmap.md'), 'utf-8')).toBe(staleRoadmap);
  });

  it('regenerates and re-stages roadmap.md into the commit when regen succeeds', () => {
    const headBefore = git(['rev-parse', 'HEAD']).trim();

    const shardDir = path.join(cwd, 'docs', 'roadmap.d');
    fs.mkdirSync(shardDir, { recursive: true });
    fs.writeFileSync(path.join(shardDir, 'alpha.md'), serializeShard(SHARD_ALPHA));
    fs.writeFileSync(path.join(shardDir, '_meta.md'), serializeMeta(META));
    git(['add', 'docs/roadmap.d']);

    // Commit succeeds; the hook regenerated docs/roadmap.md and `git add`-ed it.
    git(['commit', '-q', '-m', 'add alpha shard']);

    expect(git(['rev-parse', 'HEAD']).trim()).not.toBe(headBefore);

    // The committed roadmap.md is the regenerated aggregate (not the placeholder).
    const committed = git(['show', 'HEAD:docs/roadmap.md']);
    const parsed = parseRoadmap(committed);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.milestones.flatMap((m) => m.features.map((f) => f.name))).toContain(
        'Alpha'
      );
    }
  });
});

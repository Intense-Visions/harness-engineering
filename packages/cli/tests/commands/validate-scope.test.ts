import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  deriveChangedSurface,
  filterToDesignSurface,
  SCOPED_WALKERS,
} from '../../src/commands/validate-scope';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

function writeFile(dir: string, rel: string, contents: string): void {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
}

/** Init a git repo with a `main` branch and one committed file. */
function initRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-scope-'));
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.email', 'test@example.com'], dir);
  git(['config', 'user.name', 'Test'], dir);
  git(['config', 'commit.gpgsign', 'false'], dir);
  writeFile(dir, 'base.ts', 'export const base = 1;\n');
  git(['add', '.'], dir);
  git(['commit', '-q', '-m', 'base'], dir);
  return dir;
}

describe('deriveChangedSurface', () => {
  let repo: string;

  beforeEach(() => {
    repo = initRepo();
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('exposes the walkers it scopes (drift + brand; anatomy left full)', () => {
    expect(SCOPED_WALKERS).toEqual(['driftDetection', 'brandCompliance']);
  });

  it('returns the merge-base ref and no files when nothing changed on a branch', () => {
    git(['checkout', '-q', '-b', 'feature'], repo);
    const surface = deriveChangedSurface(repo, { defaultBranch: 'main' });
    expect(surface.ok).toBe(true);
    expect(surface.files).toEqual([]);
    // ref is the merge-base commit sha with main.
    expect(surface.ref).toBe(git(['rev-parse', 'main'], repo));
  });

  it('includes a tracked file edited in the working tree (uncommitted)', () => {
    git(['checkout', '-q', '-b', 'feature'], repo);
    writeFile(repo, 'base.ts', 'export const base = 2;\n');
    const surface = deriveChangedSurface(repo, { defaultBranch: 'main' });
    expect(surface.ok).toBe(true);
    expect(surface.files).toContain('base.ts');
  });

  it('includes a committed change on the branch vs the merge-base', () => {
    git(['checkout', '-q', '-b', 'feature'], repo);
    writeFile(repo, 'feature.ts', 'export const f = 1;\n');
    git(['add', '.'], repo);
    git(['commit', '-q', '-m', 'add feature'], repo);
    const surface = deriveChangedSurface(repo, { defaultBranch: 'main' });
    expect(surface.ok).toBe(true);
    expect(surface.files).toContain('feature.ts');
  });

  it('includes untracked new files', () => {
    writeFile(repo, 'brand-new.ts', 'export const n = 1;\n');
    const surface = deriveChangedSurface(repo, { defaultBranch: 'main' });
    expect(surface.ok).toBe(true);
    expect(surface.files).toContain('brand-new.ts');
  });

  it('excludes a deleted file (no surface to validate)', () => {
    git(['rm', '-q', 'base.ts'], repo);
    const surface = deriveChangedSurface(repo, { defaultBranch: 'main' });
    expect(surface.ok).toBe(true);
    expect(surface.files).not.toContain('base.ts');
  });

  it('honors an explicit --since ref', () => {
    const baseSha = git(['rev-parse', 'HEAD'], repo);
    writeFile(repo, 'second.ts', 'export const s = 1;\n');
    git(['add', '.'], repo);
    git(['commit', '-q', '-m', 'second'], repo);
    const surface = deriveChangedSurface(repo, { since: baseSha });
    expect(surface.ok).toBe(true);
    expect(surface.ref).toBe(baseSha);
    expect(surface.files).toContain('second.ts');
  });

  it('reports a fallback reason for an unknown --since ref (no throw)', () => {
    const surface = deriveChangedSurface(repo, { since: 'does-not-exist-ref' });
    expect(surface.ok).toBe(false);
    expect(surface.files).toEqual([]);
    expect(surface.reason).toMatch(/does-not-exist-ref/);
  });

  it('reports a fallback reason when the default branch is absent (no throw)', () => {
    const surface = deriveChangedSurface(repo, { defaultBranch: 'nonexistent-branch' });
    expect(surface.ok).toBe(false);
    expect(surface.files).toEqual([]);
    expect(surface.reason).toMatch(/nonexistent-branch/);
  });

  it('reports a fallback reason outside a git repository (no throw)', () => {
    const nonRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-scope-nonrepo-'));
    try {
      const surface = deriveChangedSurface(nonRepo, { defaultBranch: 'main' });
      expect(surface.ok).toBe(false);
      expect(surface.files).toEqual([]);
    } finally {
      fs.rmSync(nonRepo, { recursive: true, force: true });
    }
  });
});

describe('filterToDesignSurface (scoped ⊆ full parity)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-surface-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps files the design walkers scan (design extensions)', () => {
    const kept = filterToDesignSurface(dir, [
      'packages/cli/src/a.ts',
      'packages/web/Button.tsx',
      'styles/app.css',
      'styles/theme.scss',
      'lib/util.js',
      'app/view.jsx',
    ]);
    expect(kept).toEqual([
      'packages/cli/src/a.ts',
      'packages/web/Button.tsx',
      'styles/app.css',
      'styles/theme.scss',
      'lib/util.js',
      'app/view.jsx',
    ]);
  });

  it('drops non-source extensions a full sweep never scans', () => {
    const kept = filterToDesignSurface(dir, [
      'docs/readme.md',
      'harness.config.json',
      'image.png',
      'src/keep.ts',
    ]);
    expect(kept).toEqual(['src/keep.ts']);
  });

  it('drops files under skipped directories (dist, node_modules, coverage, dotdirs)', () => {
    const kept = filterToDesignSurface(dir, [
      'dist/bundle.js',
      'node_modules/pkg/index.js',
      'coverage/report.js',
      '.harness/cache/thing.ts',
      'build/out.ts',
      'src/keep.ts',
    ]);
    expect(kept).toEqual(['src/keep.ts']);
  });

  it('drops files matched by analysis.exclude ∪ design.exclude', () => {
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ analysis: { exclude: ['**/*.gen.ts'] } })
    );
    const kept = filterToDesignSurface(dir, ['src/a.gen.ts', 'src/b.ts']);
    expect(kept).toEqual(['src/b.ts']);
  });
});

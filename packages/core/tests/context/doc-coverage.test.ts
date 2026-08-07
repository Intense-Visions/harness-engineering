import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { checkDocCoverage } from '../../src/context/doc-coverage';
import { skipDirGlobs } from '@harness-engineering/graph';
import { join } from 'path';

describe('checkDocCoverage', () => {
  const fixturesDir = join(__dirname, '../fixtures');

  it('should calculate documentation coverage', async () => {
    const rootDir = join(fixturesDir, 'undocumented-project');
    const result = await checkDocCoverage('src', {
      docsDir: join(rootDir, 'docs'),
      sourceDir: join(rootDir, 'src'),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.domain).toBe('src');
      expect(result.value.documented.length).toBeGreaterThan(0);
      expect(result.value.undocumented.length).toBeGreaterThan(0);
      expect(result.value.coveragePercentage).toBeLessThan(100);
    }
  });

  it('should identify documentation gaps', async () => {
    const rootDir = join(fixturesDir, 'undocumented-project');
    const result = await checkDocCoverage('src', {
      docsDir: join(rootDir, 'docs'),
      sourceDir: join(rootDir, 'src'),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.gaps.length).toBeGreaterThan(0);
      const gap = result.value.gaps[0];
      expect(gap.file).toBeDefined();
      expect(gap.suggestedSection).toBeDefined();
      expect(['high', 'medium', 'low']).toContain(gap.importance);
    }
  });

  it('should support exclude patterns', async () => {
    const rootDir = join(fixturesDir, 'undocumented-project');
    const result = await checkDocCoverage('src', {
      docsDir: join(rootDir, 'docs'),
      sourceDir: join(rootDir, 'src'),
      excludePatterns: ['**/also-undocumented.ts'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // The excluded file should not appear in undocumented
      expect(result.value.undocumented).not.toContain(expect.stringContaining('also-undocumented'));
    }
  });

  it('should abstain (not report 100%) when no source files are scanned', async () => {
    // A scan that read zero source files verified nothing — it must never read
    // as a confident 100% (#1146). It abstains: scanned === 0, coverage 0.
    const result = await checkDocCoverage('src', {
      docsDir: join(fixturesDir, 'non-existent/docs'),
      sourceDir: join(fixturesDir, 'non-existent/src'),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.documented).toHaveLength(0);
      expect(result.value.undocumented).toHaveLength(0);
      expect(result.value.scanned).toBe(0);
      expect(result.value.coveragePercentage).toBe(0);
      expect(result.value.coveragePercentage).not.toBe(100);
    }
  });

  // #1146 discovery blind spots — verified against a purpose-built temp tree so
  // the fixture is unambiguous about extensions, dot-dirs, and denominators.
  describe('discovery blind spots (#1146)', () => {
    let root: string;

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'harness-doccov-'));
    });

    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it('discovers .mjs and .cjs alongside .ts (identical content, same finding count)', async () => {
      const src = join(root, 'src');
      await mkdir(src, { recursive: true });
      const body = 'export const value = 1;\n';
      await writeFile(join(src, 'alpha.ts'), body);
      await writeFile(join(src, 'beta.mjs'), body);
      await writeFile(join(src, 'gamma.cjs'), body);
      // No docs dir -> all three are undocumented findings.
      const result = await checkDocCoverage('src', {
        docsDir: join(root, 'docs'),
        sourceDir: src,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.scanned).toBe(3);
        expect(result.value.undocumented).toContain('alpha.ts');
        expect(result.value.undocumented).toContain('beta.mjs');
        expect(result.value.undocumented).toContain('gamma.cjs');
      }
    });

    it('scans a first-party dot-directory while keeping genuine ignores excluded', async () => {
      // First-party surface under a dot-dir.
      await mkdir(join(root, '.canary/skills/x'), { recursive: true });
      await writeFile(join(root, '.canary/skills/x/first-party.ts'), 'export const a = 1;\n');
      // Genuinely-ignored locations that must STAY invisible.
      await mkdir(join(root, 'node_modules/pkg'), { recursive: true });
      await writeFile(join(root, 'node_modules/pkg/dep.ts'), 'export const b = 2;\n');
      await mkdir(join(root, '.git'), { recursive: true });
      await writeFile(join(root, '.git/hook.ts'), 'export const c = 3;\n');
      await mkdir(join(root, '.harness'), { recursive: true });
      await writeFile(join(root, '.harness/runtime.ts'), 'export const d = 4;\n');

      const result = await checkDocCoverage('project', {
        docsDir: join(root, 'docs'),
        sourceDir: root,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const all = [...result.value.documented, ...result.value.undocumented];
        expect(all).toContain('.canary/skills/x/first-party.ts');
        expect(all.some((f) => f.includes('node_modules'))).toBe(false);
        expect(all.some((f) => f.includes('.git/'))).toBe(false);
        expect(all.some((f) => f.includes('.harness/'))).toBe(false);
        expect(result.value.scanned).toBe(1);
      }
    });

    // Regression: a scanner must not self-exclude when the CHECKOUT's own
    // absolute path contains a skip-dir segment (e.g. an `isolation: worktree`
    // agent checked out under `<repo>/.claude/worktrees/<agent>/`). The
    // default `skipDirGlobs()` list includes `**/.claude/**`; when that glob
    // was matched against the absolute file path, the checkout's `.claude`
    // prefix matched every file and drove the denominator to zero — a loud
    // false failure since #1165. See docs/changes/fix-scanner-skip-dir-self-exclude.
    it('does not self-exclude when the scan-root path contains a skip-dir segment (.claude)', async () => {
      // Build a source tree whose ABSOLUTE path literally contains `/.claude/`,
      // mirroring a worktree checkout under `<repo>/.claude/worktrees/<agent>/`.
      const proj = join(root, '.claude', 'worktrees', 'agent-x', 'proj');
      const src = join(proj, 'src');
      await mkdir(src, { recursive: true });
      await writeFile(join(src, 'alpha.ts'), 'export const a = 1;\n');
      await writeFile(join(src, 'beta.ts'), 'export const b = 2;\n');
      // A genuinely-nested `.claude/` INSIDE the scanned tree must STILL be
      // excluded — anchoring must not become "never skip .claude".
      await mkdir(join(src, '.claude', 'nested'), { recursive: true });
      await writeFile(join(src, '.claude', 'nested', 'inside.ts'), 'export const c = 3;\n');

      const result = await checkDocCoverage('project', {
        docsDir: join(proj, 'docs'),
        sourceDir: src,
        // The default exclude set — the vulnerable configuration.
        excludePatterns: [...skipDirGlobs(), '**/*.test.ts', '**/*.spec.ts'],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const all = [...result.value.documented, ...result.value.undocumented];
        // Files ARE discovered despite the `.claude` checkout-path prefix.
        expect(result.value.scanned).toBe(2);
        expect(all).toContain('alpha.ts');
        expect(all).toContain('beta.ts');
        // The genuinely-nested `.claude/` inside the tree stays excluded.
        expect(all.some((f) => f.includes('.claude/'))).toBe(false);
      }
    });

    it('abstains over a docs-only tree with zero source files (never 100%)', async () => {
      // A docs/ dir with no source files at all — the degenerate case that used
      // to report a confident 100% green.
      await mkdir(join(root, 'docs'), { recursive: true });
      await writeFile(join(root, 'docs/readme.md'), '# Docs\n');

      const result = await checkDocCoverage('project', {
        docsDir: join(root, 'docs'),
        sourceDir: join(root, 'src'),
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.scanned).toBe(0);
        expect(result.value.coveragePercentage).toBe(0);
        expect(result.value.coveragePercentage).not.toBe(100);
      }
    });
  });
});

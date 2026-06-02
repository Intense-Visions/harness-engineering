import { describe, expect, it } from 'vitest';
import {
  calibrateDepth,
  computeActivations,
  computeDepth,
  countChangedLines,
  detectRiskKeywords,
  RISK_KEYWORDS,
} from '../../src/review/depth-calibrator';
import type { DiffInfo } from '../../src/review/types';

function buildDiff(input: { changedFiles: string[]; perFile: Record<string, string> }): DiffInfo {
  return {
    changedFiles: input.changedFiles,
    newFiles: [],
    deletedFiles: [],
    totalDiffLines: Object.values(input.perFile).reduce((n, s) => n + s.split('\n').length, 0),
    fileDiffs: new Map(Object.entries(input.perFile)),
  };
}

describe('depth-calibrator', () => {
  describe('countChangedLines', () => {
    it('counts +/- lines and ignores hunk headers', () => {
      const diff = buildDiff({
        changedFiles: ['src/foo.ts'],
        perFile: {
          'src/foo.ts': [
            '--- a/src/foo.ts',
            '+++ b/src/foo.ts',
            '@@ -1,3 +1,4 @@',
            '+const a = 1;',
            '+const b = 2;',
            '-const c = 3;',
          ].join('\n'),
        },
      });
      expect(countChangedLines(diff)).toBe(3);
    });

    it('excludes test files', () => {
      const diff = buildDiff({
        changedFiles: ['src/foo.test.ts', 'src/foo.ts'],
        perFile: {
          'src/foo.test.ts': ['+import { x } from "./foo";', '+test("x", () => {});'].join('\n'),
          'src/foo.ts': ['+export const x = 1;'].join('\n'),
        },
      });
      expect(countChangedLines(diff)).toBe(1);
    });

    it('excludes lockfiles and generated files', () => {
      const diff = buildDiff({
        changedFiles: ['pnpm-lock.yaml', 'src/foo.generated.ts', 'src/foo.ts'],
        perFile: {
          'pnpm-lock.yaml': '+lockfile changes',
          'src/foo.generated.ts': '+generated stuff',
          'src/foo.ts': '+export const x = 1;',
        },
      });
      expect(countChangedLines(diff)).toBe(1);
    });

    it('falls back to totalDiffLines proportion when fileDiffs are empty', () => {
      const diff: DiffInfo = {
        changedFiles: ['src/a.ts', 'src/b.ts'],
        newFiles: [],
        deletedFiles: [],
        totalDiffLines: 100,
        fileDiffs: new Map(),
      };
      // both files are non-excluded -> ratio 1.0 -> 100
      expect(countChangedLines(diff)).toBe(100);
    });
  });

  describe('detectRiskKeywords', () => {
    it('matches whole words case-insensitively', () => {
      const diff = buildDiff({
        changedFiles: ['src/auth.ts'],
        perFile: {
          'src/auth.ts': '+function login(password: string) { return token; }',
        },
      });
      const signals = detectRiskKeywords(diff, 'feat: login flow');
      expect(signals).toContain('auth');
      expect(signals).toContain('password');
      expect(signals).toContain('token');
    });

    it('matches multi-word keywords via substring', () => {
      const diff = buildDiff({
        changedFiles: ['src/external.ts'],
        perFile: {
          'src/external.ts': '+// calls the external API endpoint',
        },
      });
      const signals = detectRiskKeywords(diff, 'docs: notes');
      expect(signals).toContain('external API');
    });

    it('does not match substrings that are inside identifiers', () => {
      const diff = buildDiff({
        changedFiles: ['src/x.ts'],
        perFile: {
          // Word-boundary matching must reject "cookie" inside "CookieCutter".
          'src/x.ts': '+const snickerdoodleCookieCutter = 1;',
        },
      });
      const signals = detectRiskKeywords(diff, '');
      expect(signals).not.toContain('cookie');
    });

    it('includes commit message in the haystack', () => {
      const diff = buildDiff({
        changedFiles: ['src/foo.ts'],
        perFile: { 'src/foo.ts': '+const x = 1;' },
      });
      const signals = detectRiskKeywords(diff, 'feat(billing): add invoice export');
      expect(signals).toContain('billing');
    });

    it('returns each matched keyword at most once', () => {
      const diff = buildDiff({
        changedFiles: ['src/foo.ts'],
        perFile: { 'src/foo.ts': '+auth.auth.auth' },
      });
      const signals = detectRiskKeywords(diff, 'auth auth auth');
      expect(signals.filter((s) => s === 'auth').length).toBe(1);
    });

    it('canonical list is published as a non-empty frozen array', () => {
      expect(RISK_KEYWORDS.length).toBeGreaterThan(10);
      expect(Object.isFrozen(RISK_KEYWORDS)).toBe(true);
    });
  });

  describe('computeDepth', () => {
    it('Quick: < 50 lines AND 0 keywords', () => {
      expect(computeDepth(10, 0)).toBe('quick');
      expect(computeDepth(49, 0)).toBe('quick');
    });

    it('Standard: 50–199 lines OR exactly 1 keyword', () => {
      expect(computeDepth(50, 0)).toBe('standard');
      expect(computeDepth(199, 0)).toBe('standard');
      expect(computeDepth(10, 1)).toBe('standard');
      expect(computeDepth(49, 1)).toBe('standard');
    });

    it('Deep: ≥ 200 lines OR 2+ keywords', () => {
      expect(computeDepth(200, 0)).toBe('deep');
      expect(computeDepth(1000, 0)).toBe('deep');
      expect(computeDepth(10, 2)).toBe('deep');
      expect(computeDepth(199, 5)).toBe('deep');
    });
  });

  describe('computeActivations', () => {
    it('Quick depth: no adversarial, conditional TS/races by signal only', () => {
      const diff = buildDiff({
        changedFiles: ['src/foo.ts'],
        perFile: { 'src/foo.ts': '+const x = 1;' },
      });
      const activations = computeActivations('quick', diff, false);
      expect(activations.has('adversarial')).toBe(false);
      expect(activations.has('typescript-strict')).toBe(true);
      expect(activations.has('frontend-races')).toBe(false);
    });

    it('Standard depth + .ts file: adversarial + ts-strict, not races', () => {
      const diff = buildDiff({
        changedFiles: ['src/api.ts'],
        perFile: { 'src/api.ts': '+export function api() {}' },
      });
      const activations = computeActivations('standard', diff, false);
      expect(activations.has('adversarial')).toBe(true);
      expect(activations.has('typescript-strict')).toBe(true);
      expect(activations.has('frontend-races')).toBe(false);
    });

    it('Standard depth + .tsx file: all three active', () => {
      const diff = buildDiff({
        changedFiles: ['src/Button.tsx'],
        perFile: { 'src/Button.tsx': '+export function Button() {}' },
      });
      const activations = computeActivations('standard', diff, false);
      expect(activations.has('adversarial')).toBe(true);
      expect(activations.has('typescript-strict')).toBe(true);
      expect(activations.has('frontend-races')).toBe(true);
    });

    it('Standard depth + non-TS file: only adversarial', () => {
      const diff = buildDiff({
        changedFiles: ['src/handler.py'],
        perFile: { 'src/handler.py': '+def handler(): pass' },
      });
      const activations = computeActivations('standard', diff, false);
      expect(activations.has('adversarial')).toBe(true);
      expect(activations.has('typescript-strict')).toBe(false);
      expect(activations.has('frontend-races')).toBe(false);
    });

    it('useEffect in .ts file activates frontend-races', () => {
      const diff = buildDiff({
        changedFiles: ['src/hook.ts'],
        perFile: {
          'src/hook.ts': '+import { useEffect } from "react";\n+useEffect(() => {}, []);',
        },
      });
      const activations = computeActivations('standard', diff, false);
      expect(activations.has('typescript-strict')).toBe(true);
      expect(activations.has('frontend-races')).toBe(true);
    });

    it('Override forces all three when depth is deep', () => {
      const diff = buildDiff({
        changedFiles: ['src/x.py'],
        perFile: { 'src/x.py': '+pass' },
      });
      const activations = computeActivations('deep', diff, true);
      expect(activations.has('adversarial')).toBe(true);
      expect(activations.has('typescript-strict')).toBe(true);
      expect(activations.has('frontend-races')).toBe(true);
    });

    it('Quick + non-test .ts still activates ts-strict (predicate is content, not depth)', () => {
      const diff = buildDiff({
        changedFiles: ['src/foo.ts'],
        perFile: { 'src/foo.ts': '+let x = 1;' },
      });
      const activations = computeActivations('quick', diff, false);
      expect(activations.has('typescript-strict')).toBe(true);
    });

    it('Test-only .ts diff does not activate ts-strict', () => {
      const diff = buildDiff({
        changedFiles: ['src/foo.test.ts'],
        perFile: { 'src/foo.test.ts': '+test("noop", () => {});' },
      });
      const activations = computeActivations('standard', diff, false);
      expect(activations.has('typescript-strict')).toBe(false);
    });

    it('.d.ts file alone does not activate ts-strict', () => {
      const diff = buildDiff({
        changedFiles: ['src/foo.d.ts'],
        perFile: { 'src/foo.d.ts': '+declare const x: number;' },
      });
      const activations = computeActivations('standard', diff, false);
      expect(activations.has('typescript-strict')).toBe(false);
    });
  });

  describe('calibrateDepth (integration)', () => {
    it('10-line config tweak -> Quick', () => {
      const diff = buildDiff({
        changedFiles: ['src/config.ts'],
        perFile: {
          'src/config.ts': Array.from({ length: 10 }, () => '+const x = 1;').join('\n'),
        },
      });
      const result = calibrateDepth({ diff, commitMessage: 'chore: bump config' });
      expect(result.depth).toBe('quick');
      expect(result.activations.has('adversarial')).toBe(false);
    });

    it('100-line refactor, 0 keywords -> Standard', () => {
      const diff = buildDiff({
        changedFiles: ['src/refactor.ts'],
        perFile: {
          'src/refactor.ts': Array.from({ length: 100 }, () => '+const x = 1;').join('\n'),
        },
      });
      const result = calibrateDepth({ diff, commitMessage: 'refactor: tidy module' });
      expect(result.depth).toBe('standard');
    });

    it('50-line auth change -> Deep (keyword forces it)', () => {
      const diff = buildDiff({
        changedFiles: ['src/auth.ts'],
        perFile: {
          'src/auth.ts':
            'auth\nauth\n' + Array.from({ length: 48 }, () => '+const x = 1;').join('\n'),
        },
      });
      const result = calibrateDepth({ diff, commitMessage: 'feat: auth + password reset' });
      // Two keywords (auth, password) force Deep regardless of size
      expect(result.depth).toBe('deep');
    });

    it('300-line UI change, 0 keywords -> Deep (size forces it)', () => {
      const diff = buildDiff({
        changedFiles: ['src/UiPage.tsx'],
        perFile: {
          'src/UiPage.tsx': Array.from({ length: 300 }, () => '+<div />').join('\n'),
        },
      });
      const result = calibrateDepth({ diff, commitMessage: 'feat: redesign landing' });
      expect(result.depth).toBe('deep');
    });

    it('30-line schema change with one keyword -> Standard', () => {
      const diff = buildDiff({
        changedFiles: ['src/schema.ts'],
        perFile: {
          'src/schema.ts': [
            '// migration: add column',
            ...Array.from({ length: 29 }, () => '+const x = 1;'),
          ].join('\n'),
        },
      });
      const result = calibrateDepth({ diff, commitMessage: 'chore: rename schema' });
      // exactly one keyword family → Standard per Decision 8 (small + 1 keyword)
      expect(result.depth).toBe('standard');
    });

    it('respects --depth override', () => {
      const diff = buildDiff({
        changedFiles: ['src/tiny.ts'],
        perFile: { 'src/tiny.ts': '+const x = 1;' },
      });
      const result = calibrateDepth({
        diff,
        commitMessage: 'docs',
        override: 'deep',
      });
      expect(result.depth).toBe('deep');
      expect(result.overridden).toBe(true);
      expect(result.activations.size).toBe(3);
    });
  });
});

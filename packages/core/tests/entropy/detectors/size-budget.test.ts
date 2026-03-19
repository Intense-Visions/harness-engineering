import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectSizeBudgetViolations, parseSize } from '../../../src/entropy/detectors/size-budget';
import type { SizeBudgetConfig } from '../../../src/entropy/types';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('parseSize', () => {
  it('parses KB', () => expect(parseSize('100KB')).toBe(102400));
  it('parses MB', () => expect(parseSize('1MB')).toBe(1048576));
  it('parses bytes', () => expect(parseSize('500')).toBe(500));
  it('parses with B suffix', () => expect(parseSize('500B')).toBe(500));
  it('returns 0 for invalid', () => expect(parseSize('')).toBe(0));
  it('is case-insensitive', () => expect(parseSize('100kb')).toBe(102400));
});

describe('detectSizeBudgetViolations', () => {
  it('returns empty report when no budgets configured', async () => {
    const result = await detectSizeBudgetViolations('/nonexistent');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.violations).toEqual([]);
      expect(result.value.stats.packagesChecked).toBe(0);
    }
  });

  it('handles non-existent directories gracefully', async () => {
    const config: Partial<SizeBudgetConfig> = {
      budgets: { 'packages/nonexistent': { warn: '100KB' } },
    };
    const result = await detectSizeBudgetViolations('/tmp/does-not-exist', config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.violations).toHaveLength(0);
      expect(result.value.stats.packagesChecked).toBe(1);
    }
  });

  describe('with real filesystem', () => {
    const testRoot = join(tmpdir(), `size-budget-test-${Date.now()}`);

    beforeEach(() => {
      mkdirSync(join(testRoot, 'pkg-a', 'dist'), { recursive: true });
      mkdirSync(join(testRoot, 'pkg-b', 'dist'), { recursive: true });
      writeFileSync(join(testRoot, 'pkg-a', 'dist', 'index.js'), 'x'.repeat(1024));
      writeFileSync(join(testRoot, 'pkg-b', 'dist', 'index.js'), 'y'.repeat(500));
    });

    afterEach(() => {
      rmSync(testRoot, { recursive: true, force: true });
    });

    it('detects violations when dist exceeds budget', async () => {
      const config: Partial<SizeBudgetConfig> = {
        budgets: {
          'pkg-a': { warn: '500B' },
          'pkg-b': { warn: '1KB' },
        },
      };
      const result = await detectSizeBudgetViolations(testRoot, config);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stats.packagesChecked).toBe(2);
        expect(result.value.violations).toHaveLength(1);
        const v = result.value.violations[0]!;
        expect(v.package).toBe('pkg-a');
        expect(v.currentSize).toBe(1024);
        expect(v.budgetSize).toBe(500);
        expect(v.tier).toBe(2);
        expect(v.severity).toBe('warning');
        expect(v.unit).toBe('bytes');
      }
    });

    it('reports no violations when under budget', async () => {
      const config: Partial<SizeBudgetConfig> = {
        budgets: {
          'pkg-a': { warn: '10KB' },
          'pkg-b': { warn: '10KB' },
        },
      };
      const result = await detectSizeBudgetViolations(testRoot, config);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.violations).toEqual([]);
      }
    });
  });
});

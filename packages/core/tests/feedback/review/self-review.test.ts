import { describe, it, expect } from 'vitest';
import { createSelfReview } from '../../../src/feedback/review/self-review';
import type { CodeChanges } from '../../../src/feedback/types';
import { join } from 'path';

describe('createSelfReview()', () => {
  const rootDir = join(__dirname, '../../fixtures/feedback');
  const changes: CodeChanges = {
    diff: '+export function test() { return 42; }',
    files: [{ path: 'src/test.ts', status: 'added', additions: 1, deletions: 0 }],
  };

  it('should create review with empty config', async () => {
    const result = await createSelfReview(changes, { rootDir });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items).toBeDefined();
      expect(result.value.summary).toBeDefined();
      expect(result.value.duration).toBeGreaterThanOrEqual(0);
    }
  });

  it('should include diff analysis when enabled', async () => {
    const changesWithConsole: CodeChanges = {
      diff: '+console.log("debug");',
      files: [{ path: 'src/index.ts', status: 'modified', additions: 1, deletions: 0 }],
    };

    const result = await createSelfReview(changesWithConsole, {
      rootDir,
      diffAnalysis: {
        enabled: true,
        forbiddenPatterns: [
          { pattern: 'console.log', message: 'Remove console.log', severity: 'warning' },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items.length).toBeGreaterThan(0);
    }
  });

  it('should include custom rules', async () => {
    const result = await createSelfReview(changes, {
      rootDir,
      customRules: [
        {
          id: 'custom-1',
          name: 'Custom Check',
          description: 'A custom check',
          severity: 'info',
          check: async () => ({ passed: true, details: 'All good' }),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items.some(i => i.id === 'custom-1')).toBe(true);
    }
  });

  it('should pass when no errors', async () => {
    const result = await createSelfReview(changes, {
      rootDir,
      customRules: [
        {
          id: 'pass',
          name: 'Passing Check',
          description: 'Always passes',
          severity: 'error',
          check: async () => ({ passed: true, details: 'OK' }),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(true);
    }
  });

  it('should fail when errors present', async () => {
    const result = await createSelfReview(changes, {
      rootDir,
      customRules: [
        {
          id: 'fail',
          name: 'Failing Check',
          description: 'Always fails',
          severity: 'error',
          check: async () => ({ passed: false, details: 'Failed' }),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(false);
    }
  });
});

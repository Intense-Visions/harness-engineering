import { describe, it, expect } from 'vitest';
import { ChecklistBuilder } from '../../../src/feedback/review/checklist';
import type { CodeChanges, CustomRule } from '../../../src/feedback/types';
import { join } from 'path';

describe('ChecklistBuilder', () => {
  const rootDir = join(__dirname, '../../fixtures/feedback');
  const changes: CodeChanges = {
    diff: '+console.log("test");',
    files: [{ path: 'src/index.ts', status: 'modified', additions: 1, deletions: 0 }],
  };

  it('should build and run empty checklist', async () => {
    const builder = new ChecklistBuilder(rootDir);
    const result = await builder.run(changes);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items).toEqual([]);
      expect(result.value.passed).toBe(true);
    }
  });

  it('should add custom rules', async () => {
    const customRule: CustomRule = {
      id: 'no-console',
      name: 'No console.log',
      description: 'Disallow console.log',
      severity: 'warning',
      check: async (changes) => ({
        passed: !changes.diff.includes('console.log'),
        details: 'Found console.log in diff',
      }),
    };

    const builder = new ChecklistBuilder(rootDir).addRule(customRule);
    const result = await builder.run(changes);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items.length).toBe(1);
      expect(result.value.items[0].passed).toBe(false);
      expect(result.value.passed).toBe(false);
    }
  });

  it('should add multiple rules', async () => {
    const rules: CustomRule[] = [
      {
        id: 'rule-1',
        name: 'Rule 1',
        description: 'Always passes',
        severity: 'info',
        check: async () => ({ passed: true, details: 'OK' }),
      },
      {
        id: 'rule-2',
        name: 'Rule 2',
        description: 'Always passes',
        severity: 'info',
        check: async () => ({ passed: true, details: 'OK' }),
      },
    ];

    const builder = new ChecklistBuilder(rootDir).addRules(rules);
    const result = await builder.run(changes);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items.length).toBe(2);
    }
  });

  it('should include diff analysis', async () => {
    const builder = new ChecklistBuilder(rootDir)
      .withDiffAnalysis({
        enabled: true,
        forbiddenPatterns: [
          { pattern: 'console.log', message: 'No console.log', severity: 'warning' },
        ],
      });

    const result = await builder.run(changes);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items.length).toBeGreaterThan(0);
    }
  });

  it('should calculate summary correctly', async () => {
    const rules: CustomRule[] = [
      {
        id: 'pass',
        name: 'Pass',
        description: 'Passes',
        severity: 'error',
        check: async () => ({ passed: true, details: 'OK' }),
      },
      {
        id: 'fail-error',
        name: 'Fail Error',
        description: 'Fails',
        severity: 'error',
        check: async () => ({ passed: false, details: 'Failed' }),
      },
      {
        id: 'fail-warning',
        name: 'Fail Warning',
        description: 'Warns',
        severity: 'warning',
        check: async () => ({ passed: false, details: 'Warning' }),
      },
    ];

    const builder = new ChecklistBuilder(rootDir).addRules(rules);
    const result = await builder.run(changes);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary.total).toBe(3);
      expect(result.value.summary.passed).toBe(1);
      expect(result.value.summary.failed).toBe(2);
      expect(result.value.summary.errors).toBe(1);
      expect(result.value.summary.warnings).toBe(1);
      expect(result.value.passed).toBe(false);
    }
  });

  it('should support method chaining', () => {
    const builder = new ChecklistBuilder(rootDir)
      .withHarnessChecks({ context: true })
      .withDiffAnalysis({ enabled: true })
      .addRule({
        id: 'test',
        name: 'Test',
        description: 'Test',
        severity: 'info',
        check: async () => ({ passed: true, details: 'OK' }),
      });

    expect(builder).toBeInstanceOf(ChecklistBuilder);
  });
});

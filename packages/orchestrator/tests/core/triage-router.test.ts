import { describe, it, expect } from 'vitest';
import { triageIssue, extractTitlePrefix } from '../../src/core/triage-router';
import type { Issue } from '@harness-engineering/types';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'id-1',
    identifier: 'TEST-1',
    title: 'Test issue',
    description: null,
    priority: null,
    state: 'Todo',
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    spec: null,
    plans: [],
    createdAt: '2026-04-16T00:00:00Z',
    updatedAt: null,
    externalId: null,
    ...overrides,
  };
}

describe('extractTitlePrefix()', () => {
  it('extracts simple prefixes', () => {
    expect(extractTitlePrefix('feat: add foo')).toBe('feat');
    expect(extractTitlePrefix('fix: bar')).toBe('fix');
    expect(extractTitlePrefix('docs: readme')).toBe('docs');
  });

  it('extracts prefixes with a scope', () => {
    expect(extractTitlePrefix('feat(auth): foo')).toBe('feat');
  });

  it('returns undefined when no prefix present', () => {
    expect(extractTitlePrefix('Just some title')).toBeUndefined();
    expect(extractTitlePrefix('')).toBeUndefined();
    expect(extractTitlePrefix(null)).toBeUndefined();
  });

  it('lowercases the prefix', () => {
    expect(extractTitlePrefix('FEAT: foo')).toBe('feat');
  });
});

describe('triageIssue()', () => {
  it('rule 1 — rollback wins even over security signals', () => {
    const decision = triageIssue(makeIssue({ labels: ['security'] }), {
      isRollback: true,
      touchesSecuritySensitivePaths: true,
    });
    expect(decision.skill).toBe('debugging');
    expect(decision.confidence).toBe('high');
    expect(decision.reasons.some((r) => /rollback/i.test(r))).toBe(true);
  });

  it('rule 2 — security prefix routes to security-review', () => {
    const decision = triageIssue(makeIssue({ title: 'security: patch SSRF' }), {});
    expect(decision.skill).toBe('security-review');
    expect(decision.confidence).toBe('high');
  });

  it('rule 2 — security label routes to security-review', () => {
    const decision = triageIssue(makeIssue({ labels: ['security'] }), {});
    expect(decision.skill).toBe('security-review');
  });

  it('rule 2 — security path signal routes to security-review', () => {
    const decision = triageIssue(makeIssue({ title: 'refactor: foo' }), {
      touchesSecuritySensitivePaths: true,
    });
    expect(decision.skill).toBe('security-review');
  });

  it('rule 3 — docs prefix routes to docs', () => {
    const decision = triageIssue(makeIssue({ title: 'docs: update readme' }), {});
    expect(decision.skill).toBe('docs');
    expect(decision.confidence).toBe('high');
  });

  it('rule 3 — docs-only diff routes to docs without prefix', () => {
    const decision = triageIssue(makeIssue({ title: 'update readme' }), { isDocsOnly: true });
    expect(decision.skill).toBe('docs');
  });

  it('rule 4 — failing tests route to debugging', () => {
    const decision = triageIssue(makeIssue({ title: 'chore: misc' }), { hasFailingTests: true });
    expect(decision.skill).toBe('debugging');
    expect(decision.confidence).toBe('medium');
  });

  it('rule 5 — migration paths route to planning', () => {
    const decision = triageIssue(makeIssue({ title: 'feat: users table' }), {
      touchesMigrationPaths: true,
    });
    expect(decision.skill).toBe('planning');
    expect(decision.confidence).toBe('high');
  });

  it('rule 6 — small fix routes to code-review', () => {
    const decision = triageIssue(makeIssue({ title: 'fix: typo' }), { changedFileCount: 1 });
    expect(decision.skill).toBe('code-review');
    expect(decision.confidence).toBe('high');
  });

  it('rule 6 — large fix does not take the code-review shortcut', () => {
    const decision = triageIssue(makeIssue({ title: 'fix: major rewrite' }), {
      changedFileCount: 20,
    });
    expect(decision.skill).not.toBe('code-review');
  });

  it('rule 7 — feature routes to planning', () => {
    const decision = triageIssue(makeIssue({ title: 'feat: new module' }), {
      changedFileCount: 10,
    });
    expect(decision.skill).toBe('planning');
    expect(decision.confidence).toBe('medium');
  });

  it('rule 8 — refactor routes to refactoring', () => {
    const decision = triageIssue(makeIssue({ title: 'refactor: extract helper' }), {});
    expect(decision.skill).toBe('refactoring');
  });

  it('rule 9 — default is code-review with low confidence', () => {
    const decision = triageIssue(makeIssue({ title: 'Something ambiguous' }), {});
    expect(decision.skill).toBe('code-review');
    expect(decision.confidence).toBe('low');
  });

  it('respects custom smallFixChangedFileMax', () => {
    const decision = triageIssue(
      makeIssue({ title: 'fix: many files' }),
      { changedFileCount: 5 },
      { smallFixChangedFileMax: 10 }
    );
    expect(decision.skill).toBe('code-review');
  });

  it('rollback label triggers rule 1', () => {
    const decision = triageIssue(makeIssue({ labels: ['Rollback'] }), {});
    expect(decision.skill).toBe('debugging');
  });

  it('reasons array always contains at least one entry', () => {
    const decision = triageIssue(makeIssue({ title: 'something' }), {});
    expect(decision.reasons.length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to extracting prefix from issue title when signals.titlePrefix is absent', () => {
    const decision = triageIssue(makeIssue({ title: 'refactor(core): split file' }), {});
    expect(decision.skill).toBe('refactoring');
  });

  it('signals.titlePrefix overrides the derived prefix', () => {
    const decision = triageIssue(makeIssue({ title: 'feat: normally a feature' }), {
      titlePrefix: 'docs',
    });
    expect(decision.skill).toBe('docs');
  });
});

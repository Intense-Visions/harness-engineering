import { describe, it, expect } from 'vitest';
import { generateRubric } from '../../src/review/meta-judge';
import type { DiffInfo } from '../../src/review/types';

function diffInfo(overrides: Partial<DiffInfo> = {}): DiffInfo {
  return {
    changedFiles: [],
    newFiles: [],
    deletedFiles: [],
    totalDiffLines: 0,
    fileDiffs: new Map(),
    ...overrides,
  };
}

function FIXED_NOW(): Date {
  return new Date('2026-04-16T12:00:00.000Z');
}

describe('generateRubric()', () => {
  it('returns a rubric with the detected changeType and heuristic source', async () => {
    const rubric = await generateRubric({
      diff: diffInfo({ changedFiles: ['packages/core/src/foo.ts'] }),
      commitMessage: 'feat: add foo',
      now: FIXED_NOW,
    });
    expect(rubric.changeType).toBe('feature');
    expect(rubric.source).toBe('heuristic');
    expect(rubric.generatedAt).toBe('2026-04-16T12:00:00.000Z');
    expect(rubric.items.length).toBeGreaterThan(0);
  });

  it('marks rubric source as spec-file when a specFile is provided', async () => {
    const rubric = await generateRubric({
      diff: diffInfo({ changedFiles: ['src/foo.ts'] }),
      commitMessage: 'feat: foo',
      specFile: 'docs/changes/foo/proposal.md',
      now: FIXED_NOW,
    });
    expect(rubric.source).toBe('spec-file');
    expect(rubric.items.some((item) => item.id === 'spec-acceptance')).toBe(true);
  });

  it('emits a regression-test criterion for bugfix changes', async () => {
    const rubric = await generateRubric({
      diff: diffInfo({ changedFiles: ['src/bar.ts'] }),
      commitMessage: 'fix: off-by-one in bar',
      now: FIXED_NOW,
    });
    expect(rubric.changeType).toBe('bugfix');
    expect(rubric.items.some((item) => item.id === 'bugfix-regression-test')).toBe(true);
  });

  it('emits a no-behavior-change criterion for refactor', async () => {
    const rubric = await generateRubric({
      diff: diffInfo({ changedFiles: ['src/baz.ts'] }),
      commitMessage: 'refactor: extract helper',
      now: FIXED_NOW,
    });
    expect(rubric.changeType).toBe('refactor');
    expect(rubric.items.some((item) => item.id === 'refactor-no-behavior-change')).toBe(true);
  });

  it('emits a docs accuracy criterion for docs-only change', async () => {
    const rubric = await generateRubric({
      diff: diffInfo({ changedFiles: ['README.md'] }),
      commitMessage: 'docs: update readme',
      now: FIXED_NOW,
    });
    expect(rubric.changeType).toBe('docs');
    expect(rubric.items.some((item) => item.id === 'docs-accuracy')).toBe(true);
  });

  it('flags security-sensitive paths as risk criteria', async () => {
    const rubric = await generateRubric({
      diff: diffInfo({ changedFiles: ['src/auth/session.ts'] }),
      commitMessage: 'feat: refresh session',
      now: FIXED_NOW,
    });
    const sec = rubric.items.find((item) => item.id === 'risk-security-sensitive');
    expect(sec).toBeDefined();
    expect(sec?.category).toBe('risk');
    expect(sec?.mustHave).toBe(true);
  });

  it('flags migration paths with a rollback criterion', async () => {
    const rubric = await generateRubric({
      diff: diffInfo({ changedFiles: ['db/migrations/0042_users.sql'] }),
      commitMessage: 'feat: add users table',
      now: FIXED_NOW,
    });
    expect(rubric.items.some((item) => item.id === 'risk-migration-rollback')).toBe(true);
  });

  it('adds orphaned-reference criterion when files are deleted', async () => {
    const rubric = await generateRubric({
      diff: diffInfo({
        changedFiles: ['src/stale.ts'],
        deletedFiles: ['src/stale.ts'],
      }),
      commitMessage: 'refactor: remove stale helper',
      now: FIXED_NOW,
    });
    expect(rubric.items.some((item) => item.id === 'quality-no-orphaned-references')).toBe(true);
  });

  it('sorts mustHave items before nice-to-have', async () => {
    const rubric = await generateRubric({
      diff: diffInfo({ changedFiles: ['src/foo.ts'] }),
      commitMessage: 'feat: foo',
      now: FIXED_NOW,
    });
    let seenNiceToHave = false;
    for (const item of rubric.items) {
      if (!item.mustHave) seenNiceToHave = true;
      else if (seenNiceToHave) {
        throw new Error(`mustHave item ${item.id} appeared after a nice-to-have`);
      }
    }
    expect(seenNiceToHave).toBe(true);
  });

  it('is deterministic for identical inputs', async () => {
    const options = {
      diff: diffInfo({
        changedFiles: ['src/auth/login.ts', 'src/auth/token.ts'],
        newFiles: ['src/auth/token.ts'],
      }),
      commitMessage: 'feat: add token rotation',
      now: FIXED_NOW,
    };
    const a = await generateRubric(options);
    const b = await generateRubric(options);
    expect(a).toEqual(b);
  });

  it('never sees file contents (type enforces diff-only metadata)', async () => {
    // This is a type-level guarantee; the test documents the invariant.
    const rubric = await generateRubric({
      diff: diffInfo({ changedFiles: ['src/foo.ts'] }),
      commitMessage: 'feat: foo',
      now: FIXED_NOW,
    });
    // No criterion should quote code — all rationales are about metadata.
    for (const item of rubric.items) {
      expect(item.rationale).not.toMatch(/function\s+\w+\s*\(/);
    }
  });

  it('uses LLM output when provided and schema-valid', async () => {
    const llm = async () =>
      JSON.stringify({
        items: [
          {
            id: 'llm-1',
            category: 'spec',
            title: 'LLM criterion',
            mustHave: true,
            rationale: 'because',
          },
        ],
      });
    const rubric = await generateRubric({
      diff: diffInfo({ changedFiles: ['src/foo.ts'] }),
      commitMessage: 'feat: foo',
      llm,
      now: FIXED_NOW,
    });
    expect(rubric.source).toBe('llm');
    expect(rubric.items).toHaveLength(1);
    expect(rubric.items[0]?.id).toBe('llm-1');
  });

  it('falls back to heuristic when LLM output is unparseable', async () => {
    const llm = async () => 'this is not json';
    const rubric = await generateRubric({
      diff: diffInfo({ changedFiles: ['src/foo.ts'] }),
      commitMessage: 'feat: foo',
      llm,
      now: FIXED_NOW,
    });
    expect(rubric.source).toBe('heuristic');
    expect(rubric.items.length).toBeGreaterThan(0);
  });

  it('falls back to heuristic when LLM throws', async () => {
    const llm = async () => {
      throw new Error('network');
    };
    const rubric = await generateRubric({
      diff: diffInfo({ changedFiles: ['src/foo.ts'] }),
      commitMessage: 'feat: foo',
      llm,
      now: FIXED_NOW,
    });
    expect(rubric.source).toBe('heuristic');
  });
});

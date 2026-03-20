import { describe, it, expect } from 'vitest';
import { detectChangeType } from '../../src/review/change-type';
import type { DiffInfo } from '../../src/review/types';

const emptyDiff: DiffInfo = {
  changedFiles: ['src/a.ts'],
  newFiles: [],
  deletedFiles: [],
  totalDiffLines: 10,
  fileDiffs: new Map(),
};

describe('detectChangeType()', () => {
  describe('commit message prefix detection', () => {
    it('detects "feat:" prefix as feature', () => {
      expect(detectChangeType('feat: add user endpoint', emptyDiff)).toBe('feature');
    });

    it('detects "feat(scope):" prefix as feature', () => {
      expect(detectChangeType('feat(api): add user endpoint', emptyDiff)).toBe('feature');
    });

    it('detects "feature:" prefix as feature', () => {
      expect(detectChangeType('feature: add login', emptyDiff)).toBe('feature');
    });

    it('detects "fix:" prefix as bugfix', () => {
      expect(detectChangeType('fix: null pointer in auth', emptyDiff)).toBe('bugfix');
    });

    it('detects "fix(scope):" prefix as bugfix', () => {
      expect(detectChangeType('fix(auth): null check', emptyDiff)).toBe('bugfix');
    });

    it('detects "bugfix:" prefix as bugfix', () => {
      expect(detectChangeType('bugfix: race condition', emptyDiff)).toBe('bugfix');
    });

    it('detects "refactor:" prefix as refactor', () => {
      expect(detectChangeType('refactor: extract service layer', emptyDiff)).toBe('refactor');
    });

    it('detects "refactor(scope):" prefix as refactor', () => {
      expect(detectChangeType('refactor(core): split module', emptyDiff)).toBe('refactor');
    });

    it('detects "docs:" prefix as docs', () => {
      expect(detectChangeType('docs: update API reference', emptyDiff)).toBe('docs');
    });

    it('detects "doc:" prefix as docs', () => {
      expect(detectChangeType('doc: fix typo', emptyDiff)).toBe('docs');
    });

    it('is case-insensitive for prefix', () => {
      expect(detectChangeType('Feat: add feature', emptyDiff)).toBe('feature');
      expect(detectChangeType('FIX: bug', emptyDiff)).toBe('bugfix');
    });
  });

  describe('diff pattern heuristic (no prefix)', () => {
    it('detects new files + test files as feature', () => {
      const diff: DiffInfo = {
        changedFiles: ['src/new-service.ts', 'tests/new-service.test.ts'],
        newFiles: ['src/new-service.ts', 'tests/new-service.test.ts'],
        deletedFiles: [],
        totalDiffLines: 50,
        fileDiffs: new Map(),
      };
      expect(detectChangeType('add user service', diff)).toBe('feature');
    });

    it('detects small changes + test added as bugfix', () => {
      const diff: DiffInfo = {
        changedFiles: ['src/auth.ts', 'tests/auth.test.ts'],
        newFiles: ['tests/auth.test.ts'],
        deletedFiles: [],
        totalDiffLines: 15,
        fileDiffs: new Map(),
      };
      expect(detectChangeType('handle null user', diff)).toBe('bugfix');
    });

    it('detects only .md files as docs', () => {
      const diff: DiffInfo = {
        changedFiles: ['README.md', 'docs/api.md'],
        newFiles: [],
        deletedFiles: [],
        totalDiffLines: 20,
        fileDiffs: new Map(),
      };
      expect(detectChangeType('update readme', diff)).toBe('docs');
    });

    it('defaults to feature when ambiguous', () => {
      const diff: DiffInfo = {
        changedFiles: ['src/a.ts', 'src/b.ts'],
        newFiles: [],
        deletedFiles: [],
        totalDiffLines: 50,
        fileDiffs: new Map(),
      };
      expect(detectChangeType('some change', diff)).toBe('feature');
    });
  });
});

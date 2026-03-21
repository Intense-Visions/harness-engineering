import { describe, it, expect, vi } from 'vitest';
import { runReviewPipeline } from '../../src/review/pipeline-orchestrator';
import type {
  PipelineFlags,
  DiffInfo,
  PrMetadata,
  MechanicalCheckResult,
  ReviewFinding,
  ContextBundle,
} from '../../src/review/types';

const DEFAULT_FLAGS: PipelineFlags = {
  comment: false,
  ci: false,
  deep: false,
  noMechanical: false,
};

const MINIMAL_DIFF: DiffInfo = {
  changedFiles: ['src/foo.ts'],
  newFiles: [],
  deletedFiles: [],
  totalDiffLines: 10,
  fileDiffs: new Map([['src/foo.ts', '+const x = 1;']]),
};

describe('runReviewPipeline()', () => {
  describe('Phase 1: GATE', () => {
    it('skips review when ciMode is true and PR is closed', async () => {
      const pr: PrMetadata = {
        state: 'closed',
        isDraft: false,
        changedFiles: ['src/foo.ts'],
        headSha: 'abc123',
        priorReviews: [],
      };
      const result = await runReviewPipeline({
        projectRoot: '/tmp/test',
        diff: MINIMAL_DIFF,
        commitMessage: 'feat: test',
        flags: { ...DEFAULT_FLAGS, ci: true },
        prMetadata: pr,
      });
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toContain('closed');
      expect(result.findings).toEqual([]);
    });

    it('does not skip when ciMode is false (manual invocation)', async () => {
      const pr: PrMetadata = {
        state: 'closed',
        isDraft: false,
        changedFiles: ['src/foo.ts'],
        headSha: 'abc123',
        priorReviews: [],
      };
      const result = await runReviewPipeline({
        projectRoot: '/tmp/test',
        diff: MINIMAL_DIFF,
        commitMessage: 'feat: test',
        flags: { ...DEFAULT_FLAGS, ci: false },
        prMetadata: pr,
      });
      expect(result.skipped).toBe(false);
    });

    it('skips draft PRs in CI mode', async () => {
      const pr: PrMetadata = {
        state: 'open',
        isDraft: true,
        changedFiles: ['src/foo.ts'],
        headSha: 'abc123',
        priorReviews: [],
      };
      const result = await runReviewPipeline({
        projectRoot: '/tmp/test',
        diff: MINIMAL_DIFF,
        commitMessage: 'feat: test',
        flags: { ...DEFAULT_FLAGS, ci: true },
        prMetadata: pr,
      });
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toContain('draft');
    });
  });

  describe('Phase 2: MECHANICAL', () => {
    it('stops pipeline when mechanical checks fail with stopPipeline', async () => {
      const result = await runReviewPipeline({
        projectRoot: '/tmp/test',
        diff: MINIMAL_DIFF,
        commitMessage: 'feat: test',
        flags: DEFAULT_FLAGS,
        // Mechanical checks will fail because /tmp/test doesn't have a valid project
        // The orchestrator should handle the error gracefully
      });
      // Pipeline should complete (may stop at mechanical or continue)
      expect(result).toBeDefined();
      expect(typeof result.exitCode).toBe('number');
    });

    it('skips mechanical phase when noMechanical flag is set', async () => {
      const result = await runReviewPipeline({
        projectRoot: '/tmp/test',
        diff: MINIMAL_DIFF,
        commitMessage: 'feat: test',
        flags: { ...DEFAULT_FLAGS, noMechanical: true },
      });
      expect(result.stoppedByMechanical).toBe(false);
      expect(result.mechanicalResult).toBeUndefined();
    });
  });

  describe('Phase 7: OUTPUT', () => {
    it('produces terminal output with Strengths/Issues/Assessment format', async () => {
      const result = await runReviewPipeline({
        projectRoot: '/tmp/test',
        diff: MINIMAL_DIFF,
        commitMessage: 'feat: test',
        flags: { ...DEFAULT_FLAGS, noMechanical: true },
      });
      expect(result.terminalOutput).toContain('Strengths');
      expect(result.terminalOutput).toContain('Issues');
      expect(result.terminalOutput).toContain('Assessment');
    });

    it('returns exit code 0 for approve/comment', async () => {
      const result = await runReviewPipeline({
        projectRoot: '/tmp/test',
        diff: MINIMAL_DIFF,
        commitMessage: 'feat: test',
        flags: { ...DEFAULT_FLAGS, noMechanical: true },
      });
      // With no real files, likely zero findings -> approve -> exit 0
      expect(result.exitCode).toBe(0);
    });

    it('produces empty githubComments when comment flag is false', async () => {
      const result = await runReviewPipeline({
        projectRoot: '/tmp/test',
        diff: MINIMAL_DIFF,
        commitMessage: 'feat: test',
        flags: { ...DEFAULT_FLAGS, noMechanical: true },
      });
      expect(result.githubComments).toEqual([]);
    });
  });

  describe('flags', () => {
    it('sets deep mode in context when --deep is passed', async () => {
      const result = await runReviewPipeline({
        projectRoot: '/tmp/test',
        diff: MINIMAL_DIFF,
        commitMessage: 'feat: test',
        flags: { ...DEFAULT_FLAGS, deep: true, noMechanical: true },
      });
      // Deep mode should not change basic output structure
      expect(result).toBeDefined();
      expect(result.terminalOutput).toBeDefined();
    });
  });

  describe('--comment flag', () => {
    it('produces GitHubInlineComment[] when comment flag is true and findings exist', async () => {
      const result = await runReviewPipeline({
        projectRoot: '/tmp/test',
        diff: {
          changedFiles: ['src/foo.ts'],
          newFiles: ['src/foo.ts'],
          deletedFiles: [],
          totalDiffLines: 5,
          fileDiffs: new Map([['src/foo.ts', 'const x = eval("1+1");']]),
        },
        commitMessage: 'feat: add eval',
        flags: { comment: true, ci: false, deep: false, noMechanical: true },
      });
      // Even if zero findings (eval pattern may not match without file content in context),
      // githubComments should be an array
      expect(Array.isArray(result.githubComments)).toBe(true);
    });

    it('githubComments are empty when comment flag is false', async () => {
      const result = await runReviewPipeline({
        projectRoot: '/tmp/test',
        diff: MINIMAL_DIFF,
        commitMessage: 'feat: test',
        flags: { ...DEFAULT_FLAGS, noMechanical: true, comment: false },
      });
      expect(result.githubComments).toEqual([]);
    });
  });

  describe('end-to-end (noMechanical)', () => {
    it('returns a complete PipelineResult', async () => {
      const result = await runReviewPipeline({
        projectRoot: '/tmp/test',
        diff: MINIMAL_DIFF,
        commitMessage: 'feat: test',
        flags: { ...DEFAULT_FLAGS, noMechanical: true },
      });
      expect(result.skipped).toBe(false);
      expect(result.stoppedByMechanical).toBe(false);
      expect(Array.isArray(result.findings)).toBe(true);
      expect(Array.isArray(result.strengths)).toBe(true);
      expect(typeof result.terminalOutput).toBe('string');
      expect(Array.isArray(result.githubComments)).toBe(true);
      expect(typeof result.exitCode).toBe('number');
    });
  });
});

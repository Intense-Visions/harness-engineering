import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../../src/config/loader', () => ({
  resolveConfig: vi.fn(),
}));

vi.mock('@harness-engineering/core', () => ({
  Ok: (val: unknown) => ({ ok: true, value: val }),
  Err: (err: unknown) => ({ ok: false, error: err }),
  parseDiff: vi.fn(),
  runReviewPipeline: vi.fn(),
}));

vi.mock('../../src/output/logger', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    dim: vi.fn(),
  },
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { execSync } from 'child_process';
import { resolveConfig } from '../../src/config/loader';
import { parseDiff, runReviewPipeline } from '@harness-engineering/core';
import { runAgentReview, createReviewCommand } from '../../src/commands/agent/review';
import { CLIError, ExitCode } from '../../src/utils/errors';

const mockedExecSync = vi.mocked(execSync);
const mockedResolveConfig = vi.mocked(resolveConfig);
const mockedParseDiff = vi.mocked(parseDiff);
const mockedRunReviewPipeline = vi.mocked(runReviewPipeline);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('createReviewCommand', () => {
  it('creates a command named review', () => {
    const cmd = createReviewCommand();
    expect(cmd.name()).toBe('review');
  });

  it('has --comment, --ci, --deep, --no-mechanical options', () => {
    const cmd = createReviewCommand();
    const names = cmd.options.map((o) => o.long);
    expect(names).toContain('--comment');
    expect(names).toContain('--ci');
    expect(names).toContain('--deep');
    expect(names).toContain('--no-mechanical');
  });
});

describe('runAgentReview', () => {
  it('returns Err when config resolution fails', async () => {
    mockedResolveConfig.mockReturnValue({
      ok: false,
      error: new CLIError('No config found', ExitCode.ERROR),
    } as never);

    const result = await runAgentReview({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('No config found');
    }
  });

  it('returns Err when git diff throws', async () => {
    mockedResolveConfig.mockReturnValue({
      ok: true,
      value: { rootDir: '/project' },
    } as never);
    mockedExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });

    const result = await runAgentReview({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Failed to get git diff');
    }
  });

  it('returns Ok with passed=true when no diff', async () => {
    mockedResolveConfig.mockReturnValue({
      ok: true,
      value: { rootDir: '/project' },
    } as never);
    // First call (cached) returns empty, second call (unstaged) returns empty
    mockedExecSync.mockReturnValue('');

    const result = await runAgentReview({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(true);
      expect(result.value.checklist[0].check).toBe('No changes to review');
    }
  });

  it('returns Err when parseDiff fails', async () => {
    mockedResolveConfig.mockReturnValue({
      ok: true,
      value: { rootDir: '/project' },
    } as never);
    mockedExecSync.mockReturnValue('diff --git a/file.ts b/file.ts\n+added line');
    mockedParseDiff.mockReturnValue({
      ok: false,
      error: { message: 'Invalid diff format' },
    } as never);

    const result = await runAgentReview({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Invalid diff format');
    }
  });

  it('returns Ok with findings on successful review', async () => {
    mockedResolveConfig.mockReturnValue({
      ok: true,
      value: { rootDir: '/project' },
    } as never);
    // git diff --cached returns content
    mockedExecSync.mockImplementation((cmd: unknown) => {
      if (String(cmd) === 'git diff --cached') return 'diff content';
      if (String(cmd) === 'git log --oneline -1') return 'abc1234 fix bug';
      return '';
    });
    mockedParseDiff.mockReturnValue({
      ok: true,
      value: {
        files: [
          { path: 'src/index.ts', status: 'modified', hunks: [] },
          { path: 'src/new.ts', status: 'added', hunks: [] },
        ],
      },
    } as never);
    mockedRunReviewPipeline.mockResolvedValue({
      exitCode: 0,
      assessment: 'Looks good',
      findings: [
        {
          domain: 'architecture',
          title: 'Clean separation',
          severity: 'suggestion',
          rationale: 'Well structured',
        },
      ],
      terminalOutput: 'Review passed',
    } as never);

    const result = await runAgentReview({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(true);
      expect(result.value.checklist).toHaveLength(1);
      expect(result.value.checklist[0].check).toContain('architecture');
      expect(result.value.checklist[0].passed).toBe(true);
      expect(result.value.pipelineResult).toBeDefined();
    }
  });

  it('returns passed=false when pipeline has non-zero exit code', async () => {
    mockedResolveConfig.mockReturnValue({
      ok: true,
      value: { rootDir: '/project' },
    } as never);
    mockedExecSync.mockImplementation((cmd: unknown) => {
      if (String(cmd) === 'git diff --cached') return 'diff content';
      if (String(cmd) === 'git log --oneline -1') return 'abc1234 bad commit';
      return '';
    });
    mockedParseDiff.mockReturnValue({
      ok: true,
      value: {
        files: [{ path: 'src/index.ts', status: 'modified', hunks: [] }],
      },
    } as never);
    mockedRunReviewPipeline.mockResolvedValue({
      exitCode: 1,
      assessment: 'Issues found',
      findings: [
        {
          domain: 'security',
          title: 'SQL injection risk',
          severity: 'error',
          rationale: 'User input unsanitized',
        },
      ],
      terminalOutput: 'Review failed',
    } as never);

    const result = await runAgentReview({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.checklist[0].passed).toBe(false);
    }
  });

  it('falls back to unstaged diff when cached is empty', async () => {
    mockedResolveConfig.mockReturnValue({
      ok: true,
      value: { rootDir: '/project' },
    } as never);
    mockedExecSync.mockImplementation((cmd: unknown) => {
      if (String(cmd) === 'git diff --cached') return '';
      if (String(cmd) === 'git diff') return 'unstaged diff';
      if (String(cmd) === 'git log --oneline -1') return 'abc1234 msg';
      return '';
    });
    mockedParseDiff.mockReturnValue({
      ok: true,
      value: { files: [{ path: 'a.ts', status: 'modified', hunks: [] }] },
    } as never);
    mockedRunReviewPipeline.mockResolvedValue({
      exitCode: 0,
      assessment: 'ok',
      findings: [],
      terminalOutput: '',
    } as never);

    const result = await runAgentReview({});
    expect(result.ok).toBe(true);
    // Should have called git diff (unstaged) after empty cached
    expect(mockedExecSync).toHaveBeenCalledWith('git diff', { encoding: 'utf-8' });
  });

  it('gracefully handles missing commit message', async () => {
    mockedResolveConfig.mockReturnValue({
      ok: true,
      value: { rootDir: '/project' },
    } as never);
    mockedExecSync.mockImplementation((cmd: unknown) => {
      if (String(cmd) === 'git diff --cached') return 'some diff';
      if (String(cmd) === 'git log --oneline -1') throw new Error('no commits');
      return '';
    });
    mockedParseDiff.mockReturnValue({
      ok: true,
      value: { files: [{ path: 'a.ts', status: 'modified', hunks: [] }] },
    } as never);
    mockedRunReviewPipeline.mockResolvedValue({
      exitCode: 0,
      assessment: 'ok',
      findings: [],
      terminalOutput: '',
    } as never);

    const result = await runAgentReview({});
    expect(result.ok).toBe(true);
    // Pipeline should have been called with empty commitMessage
    expect(mockedRunReviewPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ commitMessage: '' })
    );
  });
});

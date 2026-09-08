import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

/**
 * Branch coverage for agent/review.ts command wiring: resolveReviewMode
 * (json/quiet/text), printReviewResult (JSON / text-with-pipeline / text-no-
 * pipeline / quiet), the action's exit codes, flag spreading (thorough /
 * isolated / no-mechanical), and the guardianCoverage inclusion branch.
 */

vi.mock('child_process', () => ({ execSync: vi.fn() }));
vi.mock('../../../src/config/loader', () => ({ resolveConfig: vi.fn() }));
vi.mock('@harness-engineering/core', () => ({
  Ok: (val: unknown) => ({ ok: true, value: val }),
  Err: (err: unknown) => ({ ok: false, error: err }),
  parseDiff: vi.fn(),
  runReviewPipeline: vi.fn(),
}));
vi.mock('../../../src/output/logger', () => ({
  logger: { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn(), dim: vi.fn() },
}));
vi.mock('../../../src/utils/guardian-context', () => ({ loadGuardianCoverage: vi.fn() }));

import { execSync } from 'child_process';
import { resolveConfig } from '../../../src/config/loader';
import { parseDiff, runReviewPipeline } from '@harness-engineering/core';
import { logger } from '../../../src/output/logger';
import { loadGuardianCoverage } from '../../../src/utils/guardian-context';
import { createReviewCommand } from '../../../src/commands/agent/review';
import { CLIError, ExitCode } from '../../../src/utils/errors';

const mExec = vi.mocked(execSync);
const mConfig = vi.mocked(resolveConfig);
const mParse = vi.mocked(parseDiff);
const mPipeline = vi.mocked(runReviewPipeline);
const mGuardian = vi.mocked(loadGuardianCoverage);

let logSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;
const EXIT = new Error('exit');
const exitCodes: number[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  exitCodes.length = 0;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCodes.push(code ?? 0);
    throw EXIT;
  }) as never);
  // Defaults: config resolves, diff present, parse ok, pipeline passes.
  mConfig.mockReturnValue({ ok: true, value: { rootDir: '/project' } } as never);
  mExec.mockImplementation((cmd: unknown) => {
    if (String(cmd) === 'git diff --cached') return 'diff content';
    if (String(cmd) === 'git log --oneline -1') return 'abc123 msg';
    return '';
  });
  mParse.mockReturnValue({
    ok: true,
    value: { files: [{ path: 'a.ts', status: 'modified', hunks: [] }] },
  } as never);
  mPipeline.mockResolvedValue({
    exitCode: 0,
    assessment: 'ok',
    findings: [{ domain: 'arch', title: 'clean', severity: 'suggestion', rationale: 'good' }],
    terminalOutput: 'TERMINAL-OUTPUT',
  } as never);
  mGuardian.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function program(): Command {
  const p = new Command('harness')
    .option('--json')
    .option('--quiet')
    .option('--verbose')
    .option('-c, --config <path>');
  p.addCommand(createReviewCommand());
  return p;
}

async function drive(args: string[]): Promise<void> {
  try {
    await program().parseAsync(args, { from: 'user' });
  } catch (e) {
    if (e !== EXIT) throw e;
  }
}

function joined(): string {
  return logSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
}

describe('review command — output modes', () => {
  it('text mode prints the pipeline terminal output and exits with its code', async () => {
    await drive(['review']);
    expect(joined()).toContain('TERMINAL-OUTPUT');
    expect(exitCodes).toContain(0);
  });

  it('JSON mode prints a machine-readable object with assessment/findings/exitCode', async () => {
    await drive(['--json', 'review']);
    const line = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.trim().startsWith('{'));
    expect(line).toBeDefined();
    const parsed = JSON.parse(line!);
    expect(parsed.passed).toBe(true);
    expect(parsed.pipelineResult.exitCode).toBe(0);
    expect(parsed.pipelineResult.assessment).toBe('ok');
  });

  it('quiet mode prints nothing but still exits with the pipeline code', async () => {
    await drive(['--quiet', 'review']);
    expect(joined()).toBe('');
    expect(exitCodes).toContain(0);
  });

  it('exits with the non-zero pipeline exit code when the review fails', async () => {
    mPipeline.mockResolvedValue({
      exitCode: 1,
      assessment: 'bad',
      findings: [{ domain: 'security', title: 'x', severity: 'error', rationale: 'r' }],
      terminalOutput: 'FAILED',
    } as never);
    await drive(['review']);
    expect(exitCodes).toContain(1);
  });
});

describe('review command — no-pipeline & error paths', () => {
  it('prints the pass banner and exits SUCCESS when there are no changes', async () => {
    mExec.mockReturnValue(''); // both cached and unstaged diffs empty
    await drive(['review']);
    expect(joined()).toMatch(/Self-review passed/);
    expect(exitCodes).toContain(ExitCode.SUCCESS);
  });

  it('logs via logger.error and exits with the CLIError code on config failure (text mode)', async () => {
    mConfig.mockReturnValue({
      ok: false,
      error: new CLIError('no config', ExitCode.ERROR),
    } as never);
    await drive(['review']);
    expect(logger.error).toHaveBeenCalledWith('no config');
    expect(exitCodes).toContain(ExitCode.ERROR);
  });

  it('emits a JSON error object on failure when --json is set', async () => {
    mConfig.mockReturnValue({
      ok: false,
      error: new CLIError('boom', ExitCode.ERROR),
    } as never);
    await drive(['--json', 'review']);
    const line = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.includes('error'));
    expect(line).toBeDefined();
    expect(JSON.parse(line!)).toEqual({ error: 'boom' });
  });
});

describe('review command — flag spreading & guardian coverage', () => {
  it('passes thorough/isolated/ci/deep/comment/noMechanical into the pipeline flags', async () => {
    await drive([
      'review',
      '--thorough',
      '--isolated',
      '--ci',
      '--deep',
      '--comment',
      '--no-mechanical',
    ]);
    expect(mPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        flags: expect.objectContaining({
          comment: true,
          ci: true,
          deep: true,
          noMechanical: true,
          thorough: true,
          isolated: true,
        }),
      })
    );
  });

  it('omits thorough/isolated from flags when not supplied', async () => {
    await drive(['review']);
    const arg = mPipeline.mock.calls[0]![0] as { flags: Record<string, unknown> };
    expect(arg.flags).not.toHaveProperty('thorough');
    expect(arg.flags).not.toHaveProperty('isolated');
  });

  it('includes guardianCoverage in the pipeline input when present', async () => {
    mGuardian.mockResolvedValue('COVERAGE-BLOB');
    await drive(['review']);
    expect(mPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ guardianCoverage: 'COVERAGE-BLOB' })
    );
  });

  it('does not attach guardianCoverage when the loader returns undefined', async () => {
    mGuardian.mockResolvedValue(undefined);
    await drive(['review']);
    const arg = mPipeline.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty('guardianCoverage');
  });
});

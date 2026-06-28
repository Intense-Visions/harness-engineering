import { describe, it, expect } from 'vitest';
import {
  TaskRunner,
  classifyCheckExecutionFailure,
  recoverFindingsCount,
} from '../../src/maintenance/task-runner';
import type { CheckCommandRunner, CheckCommandResult } from '../../src/maintenance/task-runner';
import type { TaskDefinition } from '../../src/maintenance/types';
import type { MaintenanceConfig } from '@harness-engineering/types';

const baseConfig: MaintenanceConfig = { enabled: true };

/** Build a runner whose checkCommand step returns a fixed CheckCommandResult. */
function makeRunner(result: CheckCommandResult): TaskRunner {
  const checkRunner: CheckCommandRunner = {
    run: async (): Promise<CheckCommandResult> => result,
  };
  return new TaskRunner({
    config: baseConfig,
    checkRunner,
    agentDispatcher: { dispatch: async () => ({ producedCommits: false, fixed: 0 }) },
    commandExecutor: { exec: async () => ({ stdout: '' }) },
    cwd: '/tmp',
  });
}

const reportTask: TaskDefinition = {
  id: 'decay-trends',
  type: 'report-only',
  description: 'test',
  schedule: '0 7 * * 1',
  branch: null,
  checkCommand: ['predict'],
};

const mechanicalTask: TaskDefinition = {
  id: 'entropy',
  type: 'mechanical-ai',
  description: 'test',
  schedule: '0 3 * * *',
  branch: 'harness-maint/entropy-fixes',
  checkCommand: ['cleanup'],
  fixSkill: 'harness-entropy-fix',
};

describe('classifyCheckExecutionFailure', () => {
  it('flags PredictionEngine snapshot shortage as a precondition', () => {
    const cls = classifyCheckExecutionFailure(
      'x PredictionEngine requires at least 3 snapshots, got 1. Run "harness snapshot" to capture more.'
    );
    expect(cls.kind).toBe('precondition');
    expect(cls.reason).toContain('requires at least 3 snapshots');
    // leading status glyph is stripped from the reason
    expect(cls.reason).not.toMatch(/^x /);
  });

  it('flags a missing knowledge graph as a precondition', () => {
    const cls = classifyCheckExecutionFailure(
      'x No knowledge graph found. Run `harness scan` first.'
    );
    expect(cls.kind).toBe('precondition');
  });

  it('flags an unknown subcommand (MCP tool name) as unrunnable', () => {
    expect(classifyCheckExecutionFailure("error: unknown command 'assess_project'").kind).toBe(
      'unrunnable'
    );
    expect(
      classifyCheckExecutionFailure("error: unknown command 'detect_stale_constraints'").kind
    ).toBe('unrunnable');
  });

  it('flags a spawn failure / empty output as unrunnable', () => {
    expect(classifyCheckExecutionFailure('spawn ENOENT').kind).toBe('unrunnable');
    expect(classifyCheckExecutionFailure('').kind).toBe('unrunnable');
    expect(classifyCheckExecutionFailure('   \n  ').kind).toBe('unrunnable');
  });

  it('flags a timed-out check as unrunnable, never ran-no-count', () => {
    expect(classifyCheckExecutionFailure('check timed out after 300000ms').kind).toBe('unrunnable');
    expect(classifyCheckExecutionFailure('ETIMEDOUT').kind).toBe('unrunnable');
  });

  it('classifies a timeout that flushed PARTIAL parseable output as unrunnable (timeout wins over the count)', () => {
    // A check SIGTERM'd mid-run can flush a partial "5 issues" before the
    // runner appends the timeout marker. The truncated count must NOT be
    // trusted as ran-no-count — the timeout signature is matched ahead of
    // explicitFindingsCount.
    const partial = '5 issues so far...\ncheck timed out after 300000ms';
    expect(classifyCheckExecutionFailure(partial).kind).toBe('unrunnable');
  });

  it('does not false-positive on unrunnable words buried deep in a real findings report', () => {
    // `cleanup`'s drift report can contain "not found" / "ENOENT" / "unknown
    // command" inside legitimate findings. Those must NOT downgrade a check that
    // clearly RAN (header first) into a failure.
    const big =
      'x Entropy issues: 32266\nDocumentation drift:\n' +
      Array.from(
        { length: 500 },
        (_, i) => `  - roadmap.md: NOT_FOUND: Symbol "thing${i}" not found in codebase (ENOENT-ish)`
      ).join('\n') +
      '\n  - note: unknown command reference in prose';
    expect(classifyCheckExecutionFailure(big).kind).toBe('ran-no-count');
  });

  it('treats a check that ran and printed a report (no count, no refusal) as ran-no-count', () => {
    expect(
      classifyCheckExecutionFailure(
        'x Documentation coverage: 73.0%\nUndocumented files:\n  - a.ts'
      ).kind
    ).toBe('ran-no-count');
    expect(
      classifyCheckExecutionFailure('x Entropy issues: 32264\nDocumentation drift:').kind
    ).toBe('ran-no-count');
  });
});

describe('recoverFindingsCount', () => {
  it('recovers a "keyword: N" count the primary parser misses', () => {
    expect(recoverFindingsCount('x Entropy issues: 32264')).toBe(32264);
    expect(recoverFindingsCount('Findings = 12')).toBe(12);
  });

  it('recovers a "N keyword" count', () => {
    expect(recoverFindingsCount('Validation failed (45 issues)')).toBe(45);
  });

  it('falls back to 1 when no count is present (ran and signaled, count unknown)', () => {
    expect(recoverFindingsCount('x Documentation coverage: 73.0%')).toBe(1);
  });
});

describe('TaskRunner — precondition → skipped (ADR 0050)', () => {
  it('report-only: predict snapshot shortage is skipped, not failure', async () => {
    const runner = makeRunner({
      passed: false,
      findings: 0,
      output: 'x PredictionEngine requires at least 3 snapshots, got 1. Run "harness snapshot".',
      executionFailed: true,
    });
    const result = await runner.run(reportTask);
    expect(result.status).toBe('skipped');
    expect(result.error).toContain('requires at least 3 snapshots');
  });

  it('report-only: a graph-backed check before scan is skipped, not failure', async () => {
    const runner = makeRunner({
      passed: false,
      findings: 0,
      output: 'x No knowledge graph found. Run `harness scan` first.',
      executionFailed: true,
    });
    const result = await runner.run({
      ...reportTask,
      id: 'traceability',
      checkCommand: ['traceability'],
    });
    expect(result.status).toBe('skipped');
  });

  it('mechanical-ai: precondition refusal is skipped, no agent dispatch', async () => {
    let dispatched = false;
    const checkRunner: CheckCommandRunner = {
      run: async () => ({
        passed: false,
        findings: 0,
        output: 'x No knowledge graph found. Run `harness scan` first.',
        executionFailed: true,
      }),
    };
    const runner = new TaskRunner({
      config: baseConfig,
      checkRunner,
      agentDispatcher: {
        dispatch: async () => {
          dispatched = true;
          return { producedCommits: false, fixed: 0 };
        },
      },
      commandExecutor: { exec: async () => ({ stdout: '' }) },
      cwd: '/tmp',
    });
    const result = await runner.run({
      ...mechanicalTask,
      id: 'traceability',
      checkCommand: ['traceability'],
      fixSkill: 'harness-traceability-fix',
      branch: 'harness-maint/traceability-fixes',
    });
    expect(result.status).toBe('skipped');
    expect(dispatched).toBe(false);
  });
});

describe('TaskRunner — ran-no-count → success-with-recovered-count (ADR 0050)', () => {
  it('report-only: cleanup that exits non-zero with "Entropy issues: N" is success with N findings', async () => {
    const runner = makeRunner({
      passed: false,
      findings: 0,
      output: 'x Entropy issues: 32264\nDocumentation drift:\n  - roadmap.md: RENAMED',
      executionFailed: true,
    });
    const result = await runner.run({
      ...reportTask,
      id: 'entropy-report',
      checkCommand: ['cleanup'],
    });
    expect(result.status).toBe('success');
    expect(result.findings).toBe(32264);
  });

  it('mechanical-ai (report mode): check-docs drift with no count is success, never failure', async () => {
    const runner = makeRunner({
      passed: false,
      findings: 0,
      output: 'x Documentation coverage: 73.0%\nUndocumented files:\n  - a.ts',
      executionFailed: true,
    });
    const result = await runner.run(
      {
        ...mechanicalTask,
        id: 'doc-drift',
        checkCommand: ['check-docs'],
        fixSkill: 'harness-doc-fix',
        branch: 'harness-maint/doc-fixes',
      },
      'cli',
      'report'
    );
    expect(result.status).toBe('success');
    expect(result.findings).toBeGreaterThanOrEqual(1);
  });

  it('mechanical-ai (fix mode): ran-no-count dispatches the fixer (findings ≥ 1)', async () => {
    let dispatched = false;
    const checkRunner: CheckCommandRunner = {
      run: async () => ({
        passed: false,
        findings: 0,
        output: 'x Entropy issues: 32264',
        executionFailed: true,
      }),
    };
    const runner = new TaskRunner({
      config: baseConfig,
      checkRunner,
      agentDispatcher: {
        dispatch: async () => {
          dispatched = true;
          return { producedCommits: true, fixed: 3 };
        },
      },
      commandExecutor: { exec: async () => ({ stdout: '' }) },
      cwd: '/tmp',
    });
    const result = await runner.run(mechanicalTask, 'cron', 'fix');
    expect(dispatched).toBe(true);
    expect(result.findings).toBe(32264);
    expect(result.status).toBe('success');
  });
});

describe('TaskRunner — unrunnable stays failure (regression)', () => {
  it('report-only: an unknown MCP-tool-name subcommand is still failure', async () => {
    const runner = makeRunner({
      passed: false,
      findings: 0,
      output: "error: unknown command 'detect_stale_constraints'",
      executionFailed: true,
    });
    const result = await runner.run({
      ...reportTask,
      id: 'stale-constraints',
      checkCommand: ['detect_stale_constraints'],
    });
    expect(result.status).toBe('failure');
    expect(result.error).toContain('detect_stale_constraints');
  });
});

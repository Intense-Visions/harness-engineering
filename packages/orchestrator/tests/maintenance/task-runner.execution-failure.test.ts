import { describe, it, expect } from 'vitest';
import { TaskRunner } from '../../src/maintenance/task-runner';
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
  id: 'arch-violations',
  type: 'mechanical-ai',
  description: 'test',
  schedule: '0 2 * * *',
  branch: 'harness-maint/arch-fixes',
  checkCommand: ['check-arch'],
  fixSkill: 'harness-arch-fix',
};

describe('TaskRunner — check-execution failure honesty (ADR 0050)', () => {
  it('report-only: a check that could NOT run yields status=failure, not success', async () => {
    // executionFailed signals the check process could not produce a usable
    // result (spawn error / unknown subcommand / crash with no findings count).
    const runner = makeRunner({
      passed: false,
      findings: 0,
      output: "error: unknown command 'predict'",
      executionFailed: true,
    });
    const result = await runner.run(reportTask);
    expect(result.status).toBe('failure');
    expect(result.findings).toBe(0);
    expect(result.error).toContain('predict');
  });

  it('report-only: a check that RAN and found N is success with real findings', async () => {
    const runner = makeRunner({
      passed: false,
      findings: 45,
      output: 'Validation failed (45 issues)',
      executionFailed: false,
    });
    const result = await runner.run({
      ...reportTask,
      id: 'perf-check',
      checkCommand: ['check-perf'],
    });
    expect(result.status).toBe('success');
    expect(result.findings).toBe(45);
  });

  it('report-only: a clean run (no findings, no JSON) stays success with 0 findings', async () => {
    const runner = makeRunner({
      passed: true,
      findings: 0,
      output: 'all good',
      executionFailed: false,
    });
    const result = await runner.run(reportTask);
    expect(result.status).toBe('success');
    expect(result.findings).toBe(0);
  });

  it('mechanical-ai: a check that could NOT run yields status=failure (no phantom no-issues)', async () => {
    const runner = makeRunner({
      passed: false,
      findings: 0,
      output: "error: unknown command 'check-arch'",
      executionFailed: true,
    });
    const result = await runner.run(mechanicalTask);
    expect(result.status).toBe('failure');
    expect(result.error).toContain('check-arch');
  });

  it('mechanical-ai (report mode): a check that could NOT run yields failure', async () => {
    const runner = makeRunner({
      passed: false,
      findings: 0,
      output: 'spawn ENOENT',
      executionFailed: true,
    });
    const result = await runner.run(mechanicalTask, 'cli', 'report');
    expect(result.status).toBe('failure');
  });
});

import { describe, it, expect } from 'vitest';
import { TaskRunner } from '../../src/maintenance/task-runner';
import type { CheckCommandRunner, CheckCommandResult } from '../../src/maintenance/task-runner';
import type { TaskDefinition } from '../../src/maintenance/types';
import type { MaintenanceConfig } from '@harness-engineering/types';

const baseConfig: MaintenanceConfig = { enabled: true };

function makeRunner(output: string): TaskRunner {
  const checkRunner: CheckCommandRunner = {
    run: async (): Promise<CheckCommandResult> => ({
      passed: true,
      findings: 0,
      output,
    }),
  };
  return new TaskRunner({
    config: baseConfig,
    checkRunner,
    agentDispatcher: {
      dispatch: async () => ({ producedCommits: false, fixed: 0 }),
    },
    commandExecutor: { exec: async () => undefined },
    cwd: '/tmp',
  });
}

const reportTask: TaskDefinition = {
  id: 'product-pulse',
  type: 'report-only',
  description: 'test',
  schedule: '0 8 * * *',
  branch: null,
  checkCommand: ['pulse', 'run', '--non-interactive'],
};

describe('runReportOnly: JSON status mapping', () => {
  it('maps {"status":"skipped"} to RunResult.status="skipped"', async () => {
    const runner = makeRunner(
      'some log line\n{"status":"skipped","reason":"pulse.enabled is false or missing"}\n'
    );
    const result = await runner.run(reportTask);
    expect(result.status).toBe('skipped');
  });

  it('maps {"status":"success","candidatesFound":7} to status=success and findings=7', async () => {
    const runner = makeRunner('{"status":"success","candidatesFound":7}\n');
    const result = await runner.run({ ...reportTask, id: 'compound-candidates' });
    expect(result.status).toBe('success');
    expect(result.findings).toBe(7);
  });

  it('maps {"status":"no-issues"} to status=no-issues', async () => {
    const runner = makeRunner('{"status":"no-issues"}\n');
    const result = await runner.run(reportTask);
    expect(result.status).toBe('no-issues');
  });

  it('maps {"status":"failure","error":"boom"} to status=failure with error', async () => {
    const runner = makeRunner('{"status":"failure","error":"boom"}\n');
    const result = await runner.run(reportTask);
    expect(result.status).toBe('failure');
    expect(result.error).toBe('boom');
  });

  it('falls back to status=success when no JSON status line is present (legacy report-only)', async () => {
    const runner = makeRunner('legacy plain output without json status\n');
    const result = await runner.run(reportTask);
    expect(result.status).toBe('success');
  });

  it('ignores non-JSON last line and falls back to earlier JSON line', async () => {
    const runner = makeRunner('{"status":"success","candidatesFound":3}\nDone.\n');
    // Last non-empty line is "Done." which does not parse — runner should scan from end for last JSON line.
    const result = await runner.run(reportTask);
    expect(result.status).toBe('success');
    expect(result.findings).toBe(3);
  });
});

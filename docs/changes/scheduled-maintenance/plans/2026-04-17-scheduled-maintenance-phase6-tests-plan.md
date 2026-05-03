# Plan: Scheduled Maintenance Phase 6 -- Integration Tests and Edge Cases

**Date:** 2026-04-17 | **Spec:** docs/changes/scheduled-maintenance/proposal.md | **Tasks:** 5 | **Time:** ~20 min

## Goal

Fill remaining test coverage gaps for the scheduled maintenance module: integration test for leader election across two scheduler instances, integration test for the full maintenance cycle (scheduler to task runner to PR manager to reporter), and edge case tests missed by prior phases.

## Observable Truths (Acceptance Criteria)

1. When two MaintenanceScheduler instances share a single ClaimManager where only one claim succeeds, exactly one scheduler dispatches tasks and the other does not.
2. When a full maintenance cycle runs (scheduler evaluates -> onTaskDue runs TaskRunner -> TaskRunner calls PRManager -> reporter records result), the reporter contains the correct RunResult with prUrl and findings.
3. When `gh pr create` fails in PRManager.ensurePR, the error propagates to the caller.
4. When `git push --force-with-lease` fails in PRManager.ensurePR, the error propagates to the caller.
5. When the routes handler receives a POST with malformed (non-JSON) body, it returns 400 with `{ error: 'Invalid JSON body' }`.
6. When the routes handler receives GET /api/maintenance/history?limit=200, the limit is clamped to 100.
7. When MaintenanceReporter.load encounters corrupted JSON on disk, it starts with empty history and logs an error.
8. When MaintenanceScheduler.start() is called twice, it does not create duplicate intervals.
9. `npx vitest run tests/maintenance/` passes with all existing 115 tests plus the new tests (target: ~135 total).
10. `harness validate` passes.

## File Map

- CREATE packages/orchestrator/tests/maintenance/integration-leader-election.test.ts
- CREATE packages/orchestrator/tests/maintenance/integration-full-cycle.test.ts
- MODIFY packages/orchestrator/tests/maintenance/pr-manager.test.ts (add edge case tests)
- MODIFY packages/orchestrator/tests/maintenance/maintenance-routes.test.ts (add edge case tests)
- MODIFY packages/orchestrator/tests/maintenance/reporter.test.ts (add corrupted file test)
- MODIFY packages/orchestrator/tests/maintenance/scheduler.test.ts (add double-start test)

## Tasks

### Task 1: Integration test -- two schedulers, one ClaimManager (leader election)

**Depends on:** none | **Files:** packages/orchestrator/tests/maintenance/integration-leader-election.test.ts

1. Create the test file at `packages/orchestrator/tests/maintenance/integration-leader-election.test.ts` with this content:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { MaintenanceScheduler } from '../../src/maintenance/scheduler';
import type { MaintenanceConfig } from '@harness-engineering/types';

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

describe('Integration: leader election with two schedulers', () => {
  it('only one scheduler dispatches tasks when sharing a ClaimManager', async () => {
    // ClaimManager that grants the first call and rejects the second
    let callCount = 0;
    const sharedClaimManager = {
      claimAndVerify: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return { ok: true, value: 'claimed' as const };
        return { ok: true, value: 'rejected' as const };
      }),
    };

    const config: MaintenanceConfig = {
      enabled: true,
      tasks: {
        // Enable only one task for deterministic counting
        ...Object.fromEntries(
          [
            'dep-violations',
            'doc-drift',
            'security-findings',
            'entropy',
            'traceability',
            'cross-check',
            'dead-code',
            'dependency-health',
            'hotspot-remediation',
            'security-review',
            'perf-check',
            'decay-trends',
            'project-health',
            'stale-constraints',
            'graph-refresh',
            'session-cleanup',
            'perf-baselines',
          ].map((id) => [id, { enabled: false }])
        ),
      },
    };

    const onTaskDueA = vi.fn().mockResolvedValue(undefined);
    const onTaskDueB = vi.fn().mockResolvedValue(undefined);

    const schedulerA = new MaintenanceScheduler({
      config,
      claimManager: sharedClaimManager as any,
      logger: createMockLogger() as any,
      onTaskDue: onTaskDueA,
    });

    const schedulerB = new MaintenanceScheduler({
      config,
      claimManager: sharedClaimManager as any,
      logger: createMockLogger() as any,
      onTaskDue: onTaskDueB,
    });

    const time = new Date('2026-04-17T02:00:00');

    // Scheduler A evaluates first -- gets leader
    await schedulerA.evaluate(time);
    // Scheduler B evaluates second -- rejected
    await schedulerB.evaluate(time);

    expect(onTaskDueA).toHaveBeenCalledTimes(1);
    expect(onTaskDueB).not.toHaveBeenCalled();
    expect(schedulerA.getStatus().isLeader).toBe(true);
    expect(schedulerB.getStatus().isLeader).toBe(false);
  });

  it('leadership can transfer when first scheduler loses claim', async () => {
    let leaderInstance: 'A' | 'B' = 'A';
    const sharedClaimManager = {
      claimAndVerify: vi.fn().mockImplementation(async () => {
        // First two calls: A wins, B loses. Next two: B wins, A loses.
        const callIdx = sharedClaimManager.claimAndVerify.mock.calls.length;
        if (callIdx <= 2) {
          return {
            ok: true,
            value: leaderInstance === 'A' ? ('claimed' as const) : ('rejected' as const),
          };
        }
        return {
          ok: true,
          value: leaderInstance === 'B' ? ('claimed' as const) : ('rejected' as const),
        };
      }),
    };

    const config: MaintenanceConfig = {
      enabled: true,
      tasks: {
        ...Object.fromEntries(
          [
            'dep-violations',
            'doc-drift',
            'security-findings',
            'entropy',
            'traceability',
            'cross-check',
            'dead-code',
            'dependency-health',
            'hotspot-remediation',
            'security-review',
            'perf-check',
            'decay-trends',
            'project-health',
            'stale-constraints',
            'graph-refresh',
            'session-cleanup',
            'perf-baselines',
          ].map((id) => [id, { enabled: false }])
        ),
        'arch-violations': { enabled: true, schedule: '* * * * *' },
      },
    };

    const onTaskDueA = vi.fn().mockResolvedValue(undefined);
    const onTaskDueB = vi.fn().mockResolvedValue(undefined);

    const schedulerA = new MaintenanceScheduler({
      config,
      claimManager: sharedClaimManager as any,
      logger: createMockLogger() as any,
      onTaskDue: onTaskDueA,
    });

    const schedulerB = new MaintenanceScheduler({
      config,
      claimManager: sharedClaimManager as any,
      logger: createMockLogger() as any,
      onTaskDue: onTaskDueB,
    });

    // Round 1: A leads
    await schedulerA.evaluate(new Date('2026-04-17T02:00:00'));
    await schedulerB.evaluate(new Date('2026-04-17T02:00:00'));
    expect(onTaskDueA).toHaveBeenCalledTimes(1);
    expect(onTaskDueB).not.toHaveBeenCalled();

    // Transfer leadership
    leaderInstance = 'B';

    // Round 2: B leads (different minute so dedup does not block)
    await schedulerA.evaluate(new Date('2026-04-17T02:01:00'));
    await schedulerB.evaluate(new Date('2026-04-17T02:01:00'));
    expect(onTaskDueA).toHaveBeenCalledTimes(1); // No new calls
    expect(onTaskDueB).toHaveBeenCalledTimes(1);
    expect(schedulerB.getStatus().isLeader).toBe(true);
    expect(schedulerA.getStatus().isLeader).toBe(false);
  });
});
```

2. Run test:

   ```
   cd packages/orchestrator && npx vitest run tests/maintenance/integration-leader-election.test.ts
   ```

   Observe pass.

3. Run: `harness validate`
4. Commit: `test(maintenance): add integration test for leader election with two schedulers`

---

### Task 2: Integration test -- full maintenance cycle

**Depends on:** none | **Files:** packages/orchestrator/tests/maintenance/integration-full-cycle.test.ts

1. Create the test file at `packages/orchestrator/tests/maintenance/integration-full-cycle.test.ts` with this content:

```typescript
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MaintenanceScheduler } from '../../src/maintenance/scheduler';
import { TaskRunner } from '../../src/maintenance/task-runner';
import { MaintenanceReporter } from '../../src/maintenance/reporter';
import type { MaintenanceConfig } from '@harness-engineering/types';
import type { TaskDefinition } from '../../src/maintenance/types';
import type {
  CheckCommandRunner,
  AgentDispatcher,
  CommandExecutor,
  PRLifecycleManager,
} from '../../src/maintenance/task-runner';

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

describe('Integration: full maintenance cycle', () => {
  it('scheduler -> task runner -> PR manager -> reporter', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maint-integ-'));

    try {
      const config: MaintenanceConfig = {
        enabled: true,
        tasks: {
          // Disable all except arch-violations
          ...Object.fromEntries(
            [
              'dep-violations',
              'doc-drift',
              'security-findings',
              'entropy',
              'traceability',
              'cross-check',
              'dead-code',
              'dependency-health',
              'hotspot-remediation',
              'security-review',
              'perf-check',
              'decay-trends',
              'project-health',
              'stale-constraints',
              'graph-refresh',
              'session-cleanup',
              'perf-baselines',
            ].map((id) => [id, { enabled: false }])
          ),
        },
      };

      // Mock dependencies
      const checkRunner: CheckCommandRunner = {
        run: vi.fn().mockResolvedValue({ passed: false, findings: 4, output: '4 violations' }),
      };
      const agentDispatcher: AgentDispatcher = {
        dispatch: vi.fn().mockResolvedValue({ producedCommits: true, fixed: 3 }),
      };
      const commandExecutor: CommandExecutor = {
        exec: vi.fn().mockResolvedValue(undefined),
      };
      const prManager: PRLifecycleManager = {
        ensureBranch: vi.fn().mockResolvedValue({ created: true, recreated: false }),
        ensurePR: vi.fn().mockResolvedValue({
          prUrl: 'https://github.com/org/repo/pull/100',
          prUpdated: false,
        }),
      };

      const reporter = new MaintenanceReporter({ persistDir: tmpDir });
      await reporter.load();

      const taskRunner = new TaskRunner({
        config,
        checkRunner,
        agentDispatcher,
        commandExecutor,
        cwd: '/test/project',
        prManager,
      });

      // Wire scheduler's onTaskDue to run task and record result
      const onTaskDue = async (task: TaskDefinition) => {
        const result = await taskRunner.run(task);
        scheduler.recordRun(result);
        await reporter.record(result);
      };

      const claimManager = {
        claimAndVerify: vi.fn().mockResolvedValue({ ok: true, value: 'claimed' }),
      };

      const scheduler = new MaintenanceScheduler({
        config,
        claimManager: claimManager as any,
        logger: createMockLogger() as any,
        onTaskDue,
      });

      // Trigger evaluation at 2am when arch-violations is due
      await scheduler.evaluate(new Date('2026-04-17T02:00:00'));

      // Verify the full pipeline executed
      expect(checkRunner.run).toHaveBeenCalledWith(['check-arch'], '/test/project');
      expect(agentDispatcher.dispatch).toHaveBeenCalledWith(
        'harness-arch-fix',
        'harness-maint/arch-fixes',
        'local',
        '/test/project'
      );
      expect(prManager.ensureBranch).toHaveBeenCalledWith('harness-maint/arch-fixes', 'main');
      expect(prManager.ensurePR).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'arch-violations' }),
        expect.stringContaining('Findings: 4')
      );

      // Verify scheduler recorded the run
      const status = scheduler.getStatus();
      expect(status.history).toHaveLength(1);
      expect(status.history[0]!.taskId).toBe('arch-violations');
      expect(status.history[0]!.status).toBe('success');
      expect(status.history[0]!.findings).toBe(4);
      expect(status.history[0]!.fixed).toBe(3);
      expect(status.history[0]!.prUrl).toBe('https://github.com/org/repo/pull/100');

      // Verify reporter persisted to disk
      const reporterHistory = reporter.getHistory(100, 0);
      expect(reporterHistory).toHaveLength(1);
      expect(reporterHistory[0]!.prUrl).toBe('https://github.com/org/repo/pull/100');

      // Verify persistence on disk
      const diskData = JSON.parse(fs.readFileSync(path.join(tmpDir, 'history.json'), 'utf-8'));
      expect(diskData).toHaveLength(1);
      expect(diskData[0].taskId).toBe('arch-violations');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('full cycle with task failure records error in reporter', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maint-integ-fail-'));

    try {
      const config: MaintenanceConfig = {
        enabled: true,
        tasks: {
          ...Object.fromEntries(
            [
              'dep-violations',
              'doc-drift',
              'security-findings',
              'entropy',
              'traceability',
              'cross-check',
              'dead-code',
              'dependency-health',
              'hotspot-remediation',
              'security-review',
              'perf-check',
              'decay-trends',
              'project-health',
              'stale-constraints',
              'graph-refresh',
              'session-cleanup',
              'perf-baselines',
            ].map((id) => [id, { enabled: false }])
          ),
        },
      };

      const checkRunner: CheckCommandRunner = {
        run: vi.fn().mockRejectedValue(new Error('check binary not found')),
      };
      const agentDispatcher: AgentDispatcher = {
        dispatch: vi.fn().mockResolvedValue({ producedCommits: false, fixed: 0 }),
      };
      const commandExecutor: CommandExecutor = {
        exec: vi.fn().mockResolvedValue(undefined),
      };

      const reporter = new MaintenanceReporter({ persistDir: tmpDir });
      await reporter.load();

      const taskRunner = new TaskRunner({
        config,
        checkRunner,
        agentDispatcher,
        commandExecutor,
        cwd: '/test/project',
      });

      const onTaskDue = async (task: TaskDefinition) => {
        const result = await taskRunner.run(task);
        scheduler.recordRun(result);
        await reporter.record(result);
      };

      const claimManager = {
        claimAndVerify: vi.fn().mockResolvedValue({ ok: true, value: 'claimed' }),
      };

      const scheduler = new MaintenanceScheduler({
        config,
        claimManager: claimManager as any,
        logger: createMockLogger() as any,
        onTaskDue,
      });

      await scheduler.evaluate(new Date('2026-04-17T02:00:00'));

      const status = scheduler.getStatus();
      expect(status.history).toHaveLength(1);
      expect(status.history[0]!.status).toBe('failure');
      expect(status.history[0]!.error).toContain('check binary not found');

      const reporterHistory = reporter.getHistory(100, 0);
      expect(reporterHistory).toHaveLength(1);
      expect(reporterHistory[0]!.status).toBe('failure');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
```

2. Run test:

   ```
   cd packages/orchestrator && npx vitest run tests/maintenance/integration-full-cycle.test.ts
   ```

   Observe pass.

3. Run: `harness validate`
4. Commit: `test(maintenance): add integration test for full maintenance cycle`

---

### Task 3: PRManager edge case tests -- push failure and PR create failure

**Depends on:** none | **Files:** packages/orchestrator/tests/maintenance/pr-manager.test.ts

1. Add the following tests inside the `describe('ensurePR', ...)` block, after the existing `--force-with-lease` test (after line 274):

```typescript
it('propagates error when git push --force-with-lease fails', async () => {
  const git = createMockGit();
  const gh = createMockGh();
  (git.run as ReturnType<typeof vi.fn>).mockImplementation(async (args: string[]) => {
    if (args[0] === 'push') throw new Error('push rejected: stale ref');
    return '';
  });
  (gh.run as ReturnType<typeof vi.fn>).mockResolvedValue('');
  const { prManager } = createPRManager({ git, gh });

  await expect(prManager.ensurePR(ARCH_TASK, 'summary')).rejects.toThrow(
    'push rejected: stale ref'
  );
});

it('propagates error when gh pr create fails', async () => {
  const git = createMockGit();
  const gh = createMockGh();
  (gh.run as ReturnType<typeof vi.fn>).mockImplementation(async (args: string[]) => {
    if (args[0] === 'pr' && args[1] === 'list') return '';
    if (args[0] === 'pr' && args[1] === 'create') {
      throw new Error('gh: label "harness-maintenance" not found');
    }
    return '';
  });
  const { prManager } = createPRManager({ git, gh });

  await expect(prManager.ensurePR(ARCH_TASK, 'summary')).rejects.toThrow(
    'label "harness-maintenance" not found'
  );
});

it('throws when task.branch is null', async () => {
  const nullBranchTask: TaskDefinition = { ...ARCH_TASK, branch: null };
  const { prManager } = createPRManager();

  await expect(prManager.ensurePR(nullBranchTask, 'summary')).rejects.toThrow(
    'ensurePR requires task.branch'
  );
});
```

2. Run test:

   ```
   cd packages/orchestrator && npx vitest run tests/maintenance/pr-manager.test.ts
   ```

   Observe pass (13 tests total for this file).

3. Run: `harness validate`
4. Commit: `test(maintenance): add PRManager edge case tests for push and create failures`

---

### Task 4: Routes edge cases and scheduler double-start guard

**Depends on:** none | **Files:** packages/orchestrator/tests/maintenance/maintenance-routes.test.ts, packages/orchestrator/tests/maintenance/scheduler.test.ts

1. Add the following test inside `describe('POST /api/maintenance/trigger', ...)` in `maintenance-routes.test.ts`, after the existing "returns 500 when triggerFn throws" test (after line 183):

```typescript
it('returns 400 for malformed JSON body', async () => {
  const req = mockReq('POST', '/api/maintenance/trigger', 'not-json{{{');
  const res = mockRes();
  handleMaintenanceRoute(req, res, deps);
  await vi.waitFor(() => expect(res._status).toBe(400));
  expect(JSON.parse(res._body)).toEqual({ error: 'Invalid JSON body' });
});
```

2. Add the following test inside `describe('GET /api/maintenance/history', ...)` in `maintenance-routes.test.ts`, after the existing "returns the history array" test (after line 153):

```typescript
it('clamps limit to 100 when exceeding maximum', () => {
  const req = mockReq('GET', '/api/maintenance/history?limit=200');
  const res = mockRes();
  handleMaintenanceRoute(req, res, deps);
  expect(deps.reporter.getHistory).toHaveBeenCalledWith(100, 0);
});

it('clamps limit to 1 when below minimum', () => {
  const req = mockReq('GET', '/api/maintenance/history?limit=0');
  const res = mockRes();
  handleMaintenanceRoute(req, res, deps);
  expect(deps.reporter.getHistory).toHaveBeenCalledWith(1, 0);
});
```

3. Add the following test inside `describe('start and stop lifecycle', ...)` in `scheduler.test.ts`, after the existing "stop() sets isLeader to false" test (after line 281):

```typescript
it('start() called twice does not create duplicate intervals', async () => {
  const config: MaintenanceConfig = { enabled: true, checkIntervalMs: 1000 };
  const claimManager = createMockClaimManager('rejected');
  const logger = createMockLogger();

  const scheduler = new MaintenanceScheduler({
    config,
    claimManager: claimManager as any,
    logger: logger as any,
    onTaskDue: vi.fn(),
  });

  scheduler.start();
  scheduler.start(); // Second call should be no-op

  await vi.advanceTimersByTimeAsync(0);
  // Only one initial evaluate call, not two
  expect(claimManager.claimAndVerify).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(1000);
  // One interval tick, not two
  expect(claimManager.claimAndVerify).toHaveBeenCalledTimes(2);

  scheduler.stop();
});
```

4. Run tests:

   ```
   cd packages/orchestrator && npx vitest run tests/maintenance/maintenance-routes.test.ts tests/maintenance/scheduler.test.ts
   ```

   Observe pass.

5. Run: `harness validate`
6. Commit: `test(maintenance): add route edge cases and scheduler double-start guard test`

---

### Task 5: Reporter corrupted file edge case and final verification

**Depends on:** none | **Files:** packages/orchestrator/tests/maintenance/reporter.test.ts

1. Add the following test inside `describe('load', ...)` in `reporter.test.ts`, after the existing "loads existing history from disk" test (after line 56):

```typescript
it('handles corrupted JSON on disk gracefully', async () => {
  const persistDir = path.join(tmpDir, 'corrupted');
  fs.mkdirSync(persistDir, { recursive: true });
  fs.writeFileSync(path.join(persistDir, 'history.json'), '{ broken json !!!');

  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const reporter = new MaintenanceReporter({ persistDir });
  await reporter.load();

  expect(reporter.getHistory(100, 0)).toEqual([]);
  expect(consoleSpy).toHaveBeenCalledWith(
    'MaintenanceReporter: failed to load history',
    expect.any(SyntaxError)
  );
  consoleSpy.mockRestore();
});

it('handles non-array JSON on disk gracefully', async () => {
  const persistDir = path.join(tmpDir, 'non-array');
  fs.mkdirSync(persistDir, { recursive: true });
  fs.writeFileSync(path.join(persistDir, 'history.json'), '"just a string"');

  const reporter = new MaintenanceReporter({ persistDir });
  await reporter.load();

  expect(reporter.getHistory(100, 0)).toEqual([]);
});
```

2. Also need to add `vi` to the imports at the top of `reporter.test.ts` (line 1 currently imports only `describe, it, expect, beforeEach, afterEach`):

Change:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
```

To:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

3. Run all maintenance tests to verify total count:

   ```
   cd packages/orchestrator && npx vitest run tests/maintenance/ --reporter=verbose
   ```

   Expect all tests to pass. Target: ~135 tests (115 existing + ~20 new).

4. Run: `harness validate`
5. Commit: `test(maintenance): add reporter edge case tests and verify full test suite`

[checkpoint:human-verify] -- Confirm all tests pass and total count is satisfactory.

# Plan: Orchestrator PR-Aware Dispatch -- Phase 1 Core Methods

**Date:** 2026-04-16 | **Spec:** docs/changes/orchestrator-pr-aware-dispatch/proposal.md | **Tasks:** 3 | **Time:** ~12 min

## Goal

Add `isExternalPROpen()` and `filterCandidatesWithOpenPRs()` private methods to the Orchestrator class, with full unit test coverage, so that candidates with open GitHub PRs can be identified and excluded from dispatch.

## Observable Truths (Acceptance Criteria)

1. When `externalId` is `"github:owner/repo#42"` and `gh pr view` returns `"OPEN"`, `isExternalPROpen` returns `true`.
2. When `externalId` is `"github:owner/repo#42"` and `gh pr view` returns `"CLOSED"` or `"MERGED"`, `isExternalPROpen` returns `false`.
3. When `externalId` is `null`, `filterCandidatesWithOpenPRs` passes the candidate through untouched (no `gh` call).
4. When `externalId` uses a non-github scheme (e.g. `"jira:PROJ-1"`), `isExternalPROpen` returns `false` without calling `gh`.
5. When the `gh` API call fails (network error, auth failure), `isExternalPROpen` returns `false` and logs a warning via `this.logger.warn()`.
6. `filterCandidatesWithOpenPRs` runs `isExternalPROpen` in parallel via `Promise.allSettled`, excludes candidates where the result is `true`, and logs excluded candidates at info level.
7. `cd packages/orchestrator && npx vitest run tests/orchestrator-pr-guard.test.ts` passes with 8+ tests.
8. `cd packages/orchestrator && npx vitest run` passes (existing tests unbroken).

## File Map

- MODIFY `packages/orchestrator/src/orchestrator.ts` (add two private methods after `branchHasPullRequest`)
- CREATE `packages/orchestrator/tests/orchestrator-pr-guard.test.ts` (new test file)

## Tasks

### Task 1: Write test file with all test cases (red phase)

**Depends on:** none | **Files:** `packages/orchestrator/tests/orchestrator-pr-guard.test.ts`

The tests must exercise `isExternalPROpen` and `filterCandidatesWithOpenPRs` as private methods. Since they are private on the Orchestrator class, we test them indirectly by accessing them via `(orchestrator as any)` -- the same pattern used throughout this codebase for private method testing. We mock `execFile` via `vi.mock('node:child_process')`.

1. Create `packages/orchestrator/tests/orchestrator-pr-guard.test.ts` with the following content:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator } from '../src/orchestrator';
import type { Issue, WorkflowConfig } from '@harness-engineering/types';

// Mock child_process.execFile
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';

function makeConfig(): WorkflowConfig {
  return {
    tracker: {
      kind: 'roadmap',
      activeStates: ['Todo', 'In Progress'],
      terminalStates: ['Done', 'Cancelled'],
    },
    polling: { intervalMs: 30000 },
    workspace: { root: '/tmp/ws' },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 60000,
    },
    agent: {
      backend: 'mock',
      maxConcurrentAgents: 3,
      maxTurns: 20,
      maxRetryBackoffMs: 300000,
      maxRetries: 5,
      maxConcurrentAgentsByState: {},
      turnTimeoutMs: 3600000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 300000,
    },
    server: { port: null },
  };
}

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
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: null,
    externalId: null,
    ...overrides,
  };
}

describe('isExternalPROpen', () => {
  let orchestrator: Orchestrator;
  let mockExecFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new Orchestrator(makeConfig(), 'test prompt');
    mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
  });

  it('returns true when gh reports OPEN state', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, { stdout: 'OPEN\n', stderr: '' });
      }
    );

    const result = await (orchestrator as any).isExternalPROpen('github:owner/repo#42');
    expect(result).toBe(true);
    expect(mockExecFile).toHaveBeenCalledWith(
      'gh',
      ['pr', 'view', '42', '--repo', 'owner/repo', '--json', 'state', '--jq', '.state'],
      expect.objectContaining({ timeout: 10_000 }),
      expect.any(Function)
    );
  });

  it('returns false when gh reports CLOSED state', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, { stdout: 'CLOSED\n', stderr: '' });
      }
    );

    const result = await (orchestrator as any).isExternalPROpen('github:owner/repo#42');
    expect(result).toBe(false);
  });

  it('returns false when gh reports MERGED state', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, { stdout: 'MERGED\n', stderr: '' });
      }
    );

    const result = await (orchestrator as any).isExternalPROpen('github:owner/repo#42');
    expect(result).toBe(false);
  });

  it('returns false for non-github scheme without calling gh', async () => {
    const result = await (orchestrator as any).isExternalPROpen('jira:PROJ-123');
    expect(result).toBe(false);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('returns false for malformed github externalId', async () => {
    const result = await (orchestrator as any).isExternalPROpen('github:badformat');
    expect(result).toBe(false);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('returns false and logs warning when gh command fails', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(new Error('gh: not found'), { stdout: '', stderr: '' });
      }
    );

    const warnSpy = vi.spyOn((orchestrator as any).logger, 'warn');
    const result = await (orchestrator as any).isExternalPROpen('github:owner/repo#42');
    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to check PR state'),
      expect.any(Object)
    );
  });
});

describe('filterCandidatesWithOpenPRs', () => {
  let orchestrator: Orchestrator;
  let mockExecFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new Orchestrator(makeConfig(), 'test prompt');
    mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
  });

  it('excludes candidates with open PRs', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, args: string[], _opts: unknown, cb: Function) => {
        // PR #10 is open, PR #20 is closed
        if (args.includes('10')) {
          cb(null, { stdout: 'OPEN\n', stderr: '' });
        } else {
          cb(null, { stdout: 'CLOSED\n', stderr: '' });
        }
      }
    );

    const candidates = [
      makeIssue({ id: '1', title: 'Open PR', externalId: 'github:owner/repo#10' }),
      makeIssue({ id: '2', title: 'Closed PR', externalId: 'github:owner/repo#20' }),
    ];

    const infoSpy = vi.spyOn((orchestrator as any).logger, 'info');
    const result = await (orchestrator as any).filterCandidatesWithOpenPRs(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping Open PR'));
  });

  it('passes through candidates with null externalId', async () => {
    const candidates = [makeIssue({ id: '1', title: 'No external', externalId: null })];

    const result = await (orchestrator as any).filterCandidatesWithOpenPRs(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('passes through candidates when gh fails (fail-open)', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(new Error('network timeout'), { stdout: '', stderr: '' });
      }
    );

    const candidates = [
      makeIssue({ id: '1', title: 'Failing check', externalId: 'github:owner/repo#10' }),
    ];

    const result = await (orchestrator as any).filterCandidatesWithOpenPRs(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });
});
```

2. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/orchestrator && npx vitest run tests/orchestrator-pr-guard.test.ts`
3. Observe failures -- the methods do not exist yet.

---

### Task 2: Implement isExternalPROpen and filterCandidatesWithOpenPRs (green phase)

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/orchestrator.ts`

Add two private methods to the Orchestrator class, placed immediately after the `branchHasPullRequest` method (line 829).

1. In `packages/orchestrator/src/orchestrator.ts`, insert the following after the closing brace of `branchHasPullRequest` (after line 829):

```typescript
  /**
   * Checks whether an external tracker ID points to an open GitHub PR.
   * Parses `github:<owner>/<repo>#<number>` format. Non-github schemes
   * return false (fail-open, not a GitHub item). API failures return
   * false (fail-open) and log a warning.
   */
  private async isExternalPROpen(externalId: string): Promise<boolean> {
    const match = externalId.match(/^github:([^/]+\/[^#]+)#(\d+)$/);
    if (!match) return false;

    const [, repo, number] = match;
    try {
      const exec = promisify(execFile);
      const { stdout } = await exec(
        'gh',
        ['pr', 'view', number, '--repo', repo, '--json', 'state', '--jq', '.state'],
        {
          cwd: this.projectRoot,
          timeout: 10_000,
        }
      );
      return stdout.trim() === 'OPEN';
    } catch (err) {
      this.logger.warn(`Failed to check PR state for ${externalId}`, {
        error: String(err),
      });
      return false;
    }
  }

  /**
   * Filters out candidates that have an open GitHub PR, running checks
   * in parallel via Promise.allSettled. Candidates with null externalId
   * or non-github schemes pass through. Fail-open on API errors.
   */
  private async filterCandidatesWithOpenPRs(candidates: Issue[]): Promise<Issue[]> {
    const results = await Promise.allSettled(
      candidates.map(async (candidate) => {
        if (!candidate.externalId) return { candidate, isOpen: false };
        const isOpen = await this.isExternalPROpen(candidate.externalId);
        return { candidate, isOpen };
      })
    );

    const filtered: Issue[] = [];
    for (const result of results) {
      if (result.status === 'rejected') {
        // Promise.allSettled should not reject, but fail-open just in case
        continue;
      }
      const { candidate, isOpen } = result.value;
      if (isOpen) {
        this.logger.info(
          `Skipping ${candidate.title}: open PR at ${candidate.externalId}`
        );
      } else {
        filtered.push(candidate);
      }
    }
    return filtered;
  }
```

2. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/orchestrator && npx vitest run tests/orchestrator-pr-guard.test.ts`
3. Observe all tests pass.
4. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`
5. Commit: `feat(orchestrator): add isExternalPROpen and filterCandidatesWithOpenPRs methods`

---

### Task 3: Verify existing tests still pass

**Depends on:** Task 2 | **Files:** none (verification only)

1. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/orchestrator && npx vitest run`
2. Verify all existing tests pass with no regressions.
3. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`
4. Commit (if any test fixes needed): `fix(orchestrator): address test regressions from PR guard methods`

[checkpoint:human-verify] -- Confirm all tests pass before proceeding to Phase 2 (wiring into asyncTick).

# Plan: Orchestrator PR-Aware Dispatch -- Phase 2 Wire into Tick

**Date:** 2026-04-16 | **Spec:** docs/changes/orchestrator-pr-aware-dispatch/proposal.md | **Tasks:** 2 | **Time:** ~8 min

## Goal

Insert the `filterCandidatesWithOpenPRs()` call into `asyncTick()` so that candidates with open GitHub PRs are excluded before reaching the state machine or intelligence pipeline, and add an integration test with mixed candidates to prove the wiring works end-to-end.

## Observable Truths (Acceptance Criteria)

1. When `asyncTick()` fetches candidates including one with an open GitHub PR, that candidate does not appear in the tick event's `candidates` array passed to `applyEvent()`.
2. When `asyncTick()` fetches candidates with closed/merged PRs or null `externalId`, those candidates pass through to `applyEvent()` normally.
3. When `asyncTick()` fetches candidates and `gh` fails for one, that candidate still passes through (fail-open).
4. The filtered candidate list is also used by the intelligence pipeline and retry events (all three usages of `candidatesResult.value` in `asyncTick` are replaced).
5. `cd packages/orchestrator && npx vitest run tests/orchestrator-pr-guard.test.ts` passes with the new integration tests.
6. `cd packages/orchestrator && npx vitest run` passes with zero regressions.

## File Map

- MODIFY `packages/orchestrator/src/orchestrator.ts` -- insert filter call in `asyncTick()`, replace 3 references to `candidatesResult.value`
- MODIFY `packages/orchestrator/tests/orchestrator-pr-guard.test.ts` -- add `asyncTick integration` describe block

## Tasks

### Task 1: Add integration test for asyncTick with mixed candidates (red phase)

**Depends on:** none | **Files:** `packages/orchestrator/tests/orchestrator-pr-guard.test.ts`

Add a new `describe('asyncTick PR filtering')` block to the existing test file. This test constructs an Orchestrator with a mock tracker returning mixed candidates (one with open PR, one with closed PR, one with null externalId), then calls `asyncTick()` and verifies only the non-open-PR candidates reach the state machine.

We cannot directly inspect what `applyEvent` received, but we can verify the outcome: the candidate with the open PR should NOT appear in `state.claimed` or `state.running`, while the other two candidates should be dispatched (appear in `running`).

1. In `packages/orchestrator/tests/orchestrator-pr-guard.test.ts`, append the following `describe` block after the existing `filterCandidatesWithOpenPRs` describe block:

```typescript
describe('asyncTick PR filtering', () => {
  let orchestrator: Orchestrator;
  let mockExecFile: ReturnType<typeof vi.fn>;
  let mockTracker: ReturnType<typeof makeMockTracker>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTracker = makeMockTracker();
    orchestrator = new Orchestrator(makeConfig(), 'test prompt', {
      tracker: mockTracker as any,
    });
    mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
  });

  it('excludes open-PR candidates from tick event while passing others through', async () => {
    const openPRCandidate = makeIssue({
      id: 'open-pr',
      identifier: 'OPEN-1',
      title: 'Has open PR',
      state: 'Todo',
      externalId: 'github:owner/repo#10',
    });
    const closedPRCandidate = makeIssue({
      id: 'closed-pr',
      identifier: 'CLOSED-1',
      title: 'Has closed PR',
      state: 'Todo',
      externalId: 'github:owner/repo#20',
    });
    const noExternalCandidate = makeIssue({
      id: 'no-external',
      identifier: 'NONE-1',
      title: 'No external ID',
      state: 'Todo',
      externalId: null,
    });

    mockTracker.fetchCandidateIssues.mockResolvedValue({
      ok: true,
      value: [openPRCandidate, closedPRCandidate, noExternalCandidate],
    } as Ok<Issue[]>);

    // PR #10 is OPEN, PR #20 is CLOSED
    mockExecFile.mockImplementation(
      (_cmd: string, args: string[], _opts: unknown, cb: Function) => {
        if (args.includes('10')) {
          cb(null, { stdout: 'OPEN\n', stderr: '' });
        } else {
          cb(null, { stdout: 'CLOSED\n', stderr: '' });
        }
      }
    );

    await orchestrator.asyncTick();

    const snapshot = orchestrator.getSnapshot();
    const claimedIds = snapshot.claimed as string[];
    const runningEntries = snapshot.running as Array<[string, unknown]>;
    const runningIds = runningEntries.map(([id]) => id);

    // open-PR candidate should NOT be dispatched
    expect(claimedIds).not.toContain('open-pr');
    expect(runningIds).not.toContain('open-pr');

    // closed-PR and no-external candidates SHOULD be dispatched
    expect(claimedIds).toContain('closed-pr');
    expect(claimedIds).toContain('no-external');
  });

  it('passes all candidates through when gh fails (fail-open)', async () => {
    const candidate = makeIssue({
      id: 'failing-check',
      identifier: 'FAIL-1',
      title: 'API failure candidate',
      state: 'Todo',
      externalId: 'github:owner/repo#99',
    });

    mockTracker.fetchCandidateIssues.mockResolvedValue({
      ok: true,
      value: [candidate],
    } as Ok<Issue[]>);

    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(new Error('network timeout'), { stdout: '', stderr: '' });
      }
    );

    await orchestrator.asyncTick();

    const snapshot = orchestrator.getSnapshot();
    const claimedIds = snapshot.claimed as string[];

    // Should still be dispatched (fail-open)
    expect(claimedIds).toContain('failing-check');
  });
});
```

2. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/orchestrator && npx vitest run tests/orchestrator-pr-guard.test.ts`
3. Observe that the new `asyncTick PR filtering` tests **fail** because `asyncTick()` does not yet call `filterCandidatesWithOpenPRs()` -- the open-PR candidate will be dispatched, causing the first assertion (`not.toContain('open-pr')`) to fail.

---

### Task 2: Wire filterCandidatesWithOpenPRs into asyncTick (green phase)

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/orchestrator.ts`

Insert the filter call after `candidatesResult` is validated, and replace all three downstream references to `candidatesResult.value` with the filtered list.

1. In `packages/orchestrator/src/orchestrator.ts`, locate the block starting at line 666 (the empty line after the early return for failed candidate fetch). Replace the code from line 667 through line 709 with the following. The change is:
   - Add a `const candidates = await this.filterCandidatesWithOpenPRs(candidatesResult.value);` line after the candidate fetch success check
   - Replace `candidatesResult.value` with `candidates` in the three places it appears (intelligence pipeline call, tick event construction, retry event construction)

   **Exact edit -- find this block:**

   ```
    // 2. Fetch current status for running issues
   ```

   **Insert BEFORE it:**

   ```typescript
   // 1b. Filter out candidates with open PRs
   const candidates = await this.filterCandidatesWithOpenPRs(candidatesResult.value);
   ```

   Then replace all three occurrences of `candidatesResult.value` (lines 680, 689, 709) with `candidates`:
   - Line 680: `await this.runIntelligencePipeline(candidatesResult.value)` becomes `await this.runIntelligencePipeline(candidates)`
   - Line 689: `candidates: candidatesResult.value,` becomes `candidates: candidates,` (which can simplify to `candidates,`)
   - Line 709: `candidates: candidatesResult.value,` becomes `candidates,`

2. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/orchestrator && npx vitest run tests/orchestrator-pr-guard.test.ts`
3. Observe all tests pass (both existing unit tests and new integration tests).
4. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/orchestrator && npx vitest run`
5. Observe full suite passes with zero regressions.
6. Run: `npx harness validate` (from project root)
7. Commit: `feat(orchestrator): wire PR-aware candidate filter into asyncTick`

[checkpoint:human-verify] -- Confirm all tests pass before proceeding to Phase 3 (full verification and smoke test).

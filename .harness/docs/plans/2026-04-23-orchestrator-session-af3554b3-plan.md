Let me start implementing. I'll work through the tasks in dependency order, parallelizing where possible.

Now let me implement the discriminated result type. I need to check how `branchHasPullRequest` is used across the codebase.

There's a second call site in `completion/handler.ts`. Let me read that context.

Now let me update `branchHasPullRequest` with the discriminated result type. The `completion/handler.ts` call site just uses it for optional PR linking, so it can simply check `.found`.

Now update the two call sites. First, `orchestrator.ts`:

Now update the `completion/handler.ts` call site:

Tasks 2 and 4 are done (pre-escalation verification was folded into the `cleanWorkspaceWithGuard` rewrite). Now let me do Task 3 — positive-pattern validation in `findPushedBranch` — and Task 5 — `sweepStaleBranches` and `branchExistsOnRemote`.

Now let me read the full `WorkspaceManager` to understand the class structure before adding `branchExistsOnRemote` and `sweepStaleBranches`.

Now integrate the sweep into the orchestrator tick.

Let me find the tick method and the class fields to understand where to add the sweep integration.

I'll add the stale branch sweep right after step 7 (stream sweep), with a timestamp guard. Let me add the field and the sweep call.

Now let me verify the code compiles before writing tests.

Clean type-check. Now let me write the tests. First let me re-read the existing test files to understand patterns.

Good, I can see the `TestableWorkspaceManager` pattern. Now let me add the new tests.

Now update the PR detector tests to cover the new discriminated result and `--state all`.

Now I need to add a new `describe('branchHasPullRequest')` block. Let me find where to insert it — right after the existing `hasOpenPRForIdentifier` block.

Now let me run the tests to verify everything passes.

All 57 tests pass. Let me also run the full orchestrator test suite to check for regressions.

All 635 tests pass with zero regressions. Let me also run the type-check one more time to be safe.

All 7 tasks complete. Here's a summary of everything that was changed:

## Changes Made

### 1. `packages/orchestrator/src/core/pr-detector.ts`

- **`branchHasPullRequest`** now uses `--state all` to find PRs in any state (open, closed, merged) — fixes the race where a PR merges before cleanup runs
- Returns `{ found: boolean; error?: string }` instead of bare `boolean`, so callers can distinguish "no PR" from "gh CLI failed"

### 2. `packages/orchestrator/src/workspace/manager.ts`

- **`findPushedBranch`** now requires returned branch names to contain `/` (positive-pattern validation) — catches symbolic refs and non-agent branches that slip past the skip-list
- **`branchExistsOnRemote`** (new) — verifies a branch actually exists on the remote via `git ls-remote`
- **`sweepStaleBranches`** (new) — deletes remote branches that are >7 days old and have merged PRs, with concurrency-limited `gh` API calls

### 3. `packages/orchestrator/src/orchestrator.ts`

- **`cleanWorkspaceWithGuard`** rewritten with three safety layers:
  1. Verifies branch exists on remote before checking PRs
  2. On PR check error: preserves worktree but **does not escalate** (avoids false positives from network failures)
  3. Only escalates when the PR check conclusively returns "no PR found"
- **Stale branch sweep** integrated into tick cycle, runs at most once per hour

### 4. `packages/orchestrator/src/completion/handler.ts`

- Updated to use the new discriminated result from `branchHasPullRequest`

### 5. Tests (2 files, 14 new test cases)

- `branchHasPullRequest`: `--state all`, discriminated results, error handling
- `findPushedBranch`: slash validation, positive/negative cases
- `branchExistsOnRemote`: found, not found, error
- `sweepStaleBranches`: old+merged, recent, no-PR, error, empty

**All 635 orchestrator tests pass. Type-check clean.**All 7 tasks complete. Here's a summary of everything that was changed:

## Changes Made

### 1. `packages/orchestrator/src/core/pr-detector.ts`

- **`branchHasPullRequest`** now uses `--state all` to find PRs in any state (open, closed, merged) — fixes the race where a PR merges before cleanup runs
- Returns `{ found: boolean; error?: string }` instead of bare `boolean`, so callers can distinguish "no PR" from "gh CLI failed"

### 2. `packages/orchestrator/src/workspace/manager.ts`

- **`findPushedBranch`** now requires returned branch names to contain `/` (positive-pattern validation) — catches symbolic refs and non-agent branches that slip past the skip-list
- **`branchExistsOnRemote`** (new) — verifies a branch actually exists on the remote via `git ls-remote`
- **`sweepStaleBranches`** (new) — deletes remote branches that are >7 days old and have merged PRs, with concurrency-limited `gh` API calls

### 3. `packages/orchestrator/src/orchestrator.ts`

- **`cleanWorkspaceWithGuard`** rewritten with three safety layers:
  1. Verifies branch exists on remote before checking PRs
  2. On PR check error: preserves worktree but **does not escalate** (avoids false positives from network failures)
  3. Only escalates when the PR check conclusively returns "no PR found"
- **Stale branch sweep** integrated into tick cycle, runs at most once per hour

### 4. `packages/orchestrator/src/completion/handler.ts`

- Updated to use the new discriminated result from `branchHasPullRequest`

### 5. Tests (2 files, 14 new test cases)

- `branchHasPullRequest`: `--state all`, discriminated results, error handling
- `findPushedBranch`: slash validation, positive/negative cases
- `branchExistsOnRemote`: found, not found, error
- `sweepStaleBranches`: old+merged, recent, no-PR, error, empty

**All 635 orchestrator tests pass. Type-check clean.**

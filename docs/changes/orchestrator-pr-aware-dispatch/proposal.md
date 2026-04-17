# Orchestrator PR-Aware Dispatch Guard

## Overview

When the orchestrator polls for candidate work items, it dispatches agents to any roadmap feature with an active status (`planned`/`in-progress`) regardless of whether a pull request already exists for that feature. This leads to duplicate PRs, wasted agent compute, and potential merge conflicts.

This change adds a pre-filter step in the orchestrator's tick cycle that checks each candidate's `externalId` against GitHub's PR API. Candidates with open PRs are excluded from dispatch. Closed, merged, or unreachable PRs are treated as dispatchable (fail-open).

### Goals

- Prevent duplicate agent dispatch for features that already have open PRs
- Zero impact on orchestrator availability — fail open on API errors
- No changes to the tracker adapter, state machine, or workspace manager interfaces

### Non-Goals

- Resuming work on an existing PR branch (future feature)
- Caching PR state across ticks
- Supporting non-GitHub tracker schemes (graceful no-op for now)

## Decisions

| #   | Decision                                                          | Rationale                                                                                                             |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Skip dispatch if PR is open; allow if closed/merged/absent        | Prevents duplicate work while allowing re-dispatch for abandoned or completed PRs                                     |
| 2   | Filter in orchestrator tick, not tracker adapter or state machine | Orchestrator already owns `gh` integration; keeps tracker adapter as a pure file read and state machine as pure logic |
| 3   | Dedicated `isExternalPROpen()` method                             | Purpose-built for the `github:owner/repo#N` format with graceful no-op for unknown schemes                            |
| 4   | Fail open with warning on API errors                              | Matches existing `branchHasPullRequest()` pattern; orchestrator stays available during GitHub outages                 |
| 5   | No caching                                                        | Candidate count with externalIds is small; stateless avoids stale-cache bugs                                          |

## Technical Design

### New method: `isExternalPROpen()`

- Location: `packages/orchestrator/src/orchestrator.ts`
- Parses `externalId` string matching `github:<owner>/<repo>#<number>`
- Calls `gh pr view <number> --repo <owner>/<repo> --json state --jq .state`
- Returns `true` if state is `"OPEN"`, `false` otherwise
- On parse failure (non-github scheme, malformed ID): returns `false` (fail-open, no warning — not a GitHub item)
- On API failure (network, auth, rate limit): returns `false` (fail-open), logs warning via `this.logger.warn()`

### New method: `filterCandidatesWithOpenPRs()`

- Location: `packages/orchestrator/src/orchestrator.ts`
- Takes `Issue[]`, returns `Promise<Issue[]>`
- Runs `isExternalPROpen()` in parallel via `Promise.allSettled()` for all candidates where `externalId` is non-null
- Candidates with null `externalId` pass through untouched
- Candidates where the check resolves to `true` (open PR) are excluded
- Excluded candidates are logged at `info` level: `"Skipping <title>: open PR at <externalId>"`

### Wiring in `asyncTick()`

- Inserted between the `fetchCandidateIssues()` result and the `applyEvent(state, tickEvent)` call
- The filtered candidates list replaces the raw candidates in the tick event payload

### File Layout

No new files beyond tests:

- `packages/orchestrator/src/orchestrator.ts` — two new private methods + one line change in `asyncTick()`
- `packages/orchestrator/tests/orchestrator-pr-guard.test.ts` — new test file

### Data Structures

No new types. Operates on existing `Issue` type (reads `externalId: string | null`). No changes to `RoadmapFeature`, `Issue`, or any shared types.

## Success Criteria

1. When [candidate has externalId pointing to an open GitHub PR], the system shall [exclude it from dispatch].
2. When [candidate has externalId pointing to a closed or merged PR], the system shall [dispatch it normally].
3. When [candidate has null externalId], the system shall [dispatch it normally].
4. When [candidate has non-github externalId scheme], the system shall [dispatch it normally without calling gh].
5. If [`gh` API call fails], then the system shall [dispatch the candidate and log a warning].
6. The system shall not [modify the Issue type, tracker adapter interface, or state machine logic].
7. All new code has unit test coverage.
8. Existing orchestrator tests continue to pass.

## Implementation Order

1. **Phase 1: Core methods** — Implement `isExternalPROpen()` and `filterCandidatesWithOpenPRs()` with unit tests
2. **Phase 2: Wire into tick** — Insert filter call in `asyncTick()`, integration test with mixed candidates
3. **Phase 3: Verify** — Run full orchestrator test suite, manual smoke test with a roadmap containing items with open PRs

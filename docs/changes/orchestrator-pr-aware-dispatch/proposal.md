# Orchestrator PR-Aware Dispatch Guard

## Overview

When the orchestrator polls for candidate work items, it dispatches agents to any roadmap feature with an active status (`planned`/`in-progress`) regardless of whether a pull request already exists for that feature. This leads to duplicate PRs, wasted agent compute, and potential merge conflicts.

This change adds a pre-filter step in the orchestrator's tick cycle that checks each candidate's identifier against GitHub's PR API by looking for open PRs on the `feat/<identifier>` branch. Candidates with open PRs are excluded from dispatch. API errors are handled fail-open so the orchestrator stays available during GitHub outages.

### Goals

- Prevent duplicate agent dispatch for features that already have open PRs
- Zero impact on orchestrator availability — fail open on API errors
- No changes to the tracker adapter, state machine, or workspace manager interfaces

### Non-Goals

- Resuming work on an existing PR branch (future feature)
- Caching PR state across ticks
- Supporting non-GitHub tracker schemes (graceful no-op for now)

## Decisions

| #   | Decision                                                          | Rationale                                                                                                                                      |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Skip dispatch if open PR exists on `feat/<identifier>` branch     | Prevents duplicate work while allowing re-dispatch for abandoned or completed PRs                                                              |
| 2   | Use identifier-based branch lookup, not externalId PR lookup      | ExternalIds reference GitHub **issues**, not PRs. Branch naming convention (`feat/<identifier>`) is reliable and used by all dispatched agents |
| 3   | Filter in orchestrator tick, not tracker adapter or state machine | Orchestrator already owns `gh` integration; keeps tracker adapter as a pure file read and state machine as pure logic                          |
| 4   | Dedicated `hasOpenPRForIdentifier()` method                       | Purpose-built for the `feat/<identifier>` branch naming convention with fail-open semantics                                                    |
| 5   | Fail open with warning on API errors                              | Matches existing `branchHasPullRequest()` pattern; orchestrator stays available during GitHub outages                                          |
| 6   | No caching                                                        | Candidate count is small; stateless avoids stale-cache bugs                                                                                    |

## Technical Design

### Method: `hasOpenPRForIdentifier()`

- Location: `packages/orchestrator/src/orchestrator.ts`
- Calls `gh pr list --head feat/<identifier> --state open --json number --jq length`
- Returns `true` if count > 0 (open PR exists), `false` otherwise
- On API failure (network, auth, rate limit, `gh` not installed): returns `false` (fail-open), logs warning via `this.logger.warn()`
- Timeout: 10 seconds per check

### Method: `filterCandidatesWithOpenPRs()`

- Location: `packages/orchestrator/src/orchestrator.ts`
- Takes `Issue[]`, returns `Promise<Issue[]>`
- Runs `hasOpenPRForIdentifier()` in parallel via `Promise.allSettled()` for all candidates
- Candidates where the check resolves to `true` (open PR) are excluded
- Candidates where the promise rejects are included (fail-open)
- Excluded candidates are logged at `info` level: `"Skipping <title>: open PR exists for feat/<identifier>"`

### Wiring in `asyncTick()`

- Inserted between the `fetchCandidateIssues()` result and the `applyEvent(state, tickEvent)` call (step 1b)
- The filtered candidates list replaces the raw candidates in the tick event payload

### File Layout

No new files beyond tests:

- `packages/orchestrator/src/orchestrator.ts` — two private methods + one line change in `asyncTick()`
- `packages/orchestrator/tests/orchestrator-pr-guard.test.ts` — dedicated test file

### Data Structures

No new types. Operates on existing `Issue` type (reads `identifier: string`). No changes to `RoadmapFeature`, `Issue`, or any shared types.

## Success Criteria

1. When [candidate has an open PR on its `feat/<identifier>` branch], the system shall [exclude it from dispatch].
2. When [candidate has no open PR on its `feat/<identifier>` branch], the system shall [dispatch it normally].
3. When [candidate has a closed or merged PR], the system shall [dispatch it normally].
4. If [`gh` API call fails], then the system shall [dispatch the candidate and log a warning].
5. If [`gh` command is not available or times out], then the system shall [dispatch the candidate and log a warning].
6. The system shall not [modify the Issue type, tracker adapter interface, or state machine logic].
7. All new code has unit test coverage (8 tests across 3 suites).
8. Existing orchestrator tests continue to pass.

## Implementation Order

1. **Phase 1: Core methods** — Implement `hasOpenPRForIdentifier()` and `filterCandidatesWithOpenPRs()` with unit tests
2. **Phase 2: Wire into tick** — Insert filter call in `asyncTick()`, integration test with mixed candidates
3. **Phase 3: Verify** — Run full orchestrator test suite, manual smoke test with a roadmap containing items with open PRs

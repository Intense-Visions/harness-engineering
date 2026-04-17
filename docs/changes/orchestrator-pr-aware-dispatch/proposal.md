# Orchestrator PR-Aware Dispatch Guard

## Overview

When the orchestrator polls for candidate work items, it dispatches agents to any roadmap feature with an active status (`planned`/`in-progress`) regardless of whether a pull request already exists for that feature. This leads to duplicate PRs, wasted agent compute, and potential merge conflicts.

This change adds a pre-filter step in the orchestrator's tick cycle that checks each candidate against GitHub's PR API. For candidates with an `externalId` (format `github:owner/repo#42`), the guard searches for open PRs linked to that GitHub issue. For candidates without an `externalId`, it falls back to checking for open PRs on the `feat/<identifier>` branch. API errors are handled fail-open so the orchestrator stays available during GitHub outages.

### Goals

- Prevent duplicate agent dispatch for features that already have open PRs
- Use `externalId` for accurate PR detection via linked-issue search
- Fall back to branch-name convention for candidates without `externalId`
- Zero impact on orchestrator availability — fail open on API errors
- No changes to the tracker adapter, state machine, or workspace manager interfaces

### Non-Goals

- Resuming work on an existing PR branch (future feature)
- Caching PR state across ticks
- Supporting non-GitHub tracker schemes (graceful no-op for now)

## Decisions

| #   | Decision                                                          | Rationale                                                                                                                                   |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Skip dispatch if open PR exists linked to candidate               | Prevents duplicate work while allowing re-dispatch for abandoned or completed PRs                                                           |
| 2   | Prefer externalId-based search, fall back to identifier branch    | ExternalId gives the GitHub issue number, enabling `gh pr list --search` to find PRs by linked-issue regardless of branch naming convention |
| 3   | Filter in orchestrator tick, not tracker adapter or state machine | Orchestrator already owns `gh` integration; keeps tracker adapter as a pure file read and state machine as pure logic                       |
| 4   | Dedicated methods for each lookup strategy                        | `hasOpenPRForExternalId()` for issue-linked PRs, `hasOpenPRForIdentifier()` for branch-name convention                                      |
| 5   | Fail open with warning on API errors                              | Matches existing patterns; orchestrator stays available during GitHub outages                                                               |
| 6   | No caching                                                        | Candidate count is small; stateless avoids stale-cache bugs                                                                                 |
| 7   | Reuse `parseExternalId()` from core adapter                       | Avoids duplicating the `github:owner/repo#N` parsing regex                                                                                  |

## Technical Design

### Method: `hasOpenPRForExternalId()`

- Location: `packages/orchestrator/src/orchestrator.ts`
- Parses `externalId` via `parseExternalId()` from `@harness-engineering/core`
- Calls `gh pr list --repo owner/repo --search "closes #N" --state open --json number --jq length`
- Returns `true` if count > 0 (open PR linked to issue), `false` otherwise
- On parse failure (non-GitHub externalId): returns `false` (fail-open)
- On API failure: returns `false` (fail-open), logs warning
- Timeout: 10 seconds

### Method: `hasOpenPRForIdentifier()` (existing)

- Calls `gh pr list --head feat/<identifier> --state open --json number --jq length`
- Returns `true` if count > 0, `false` otherwise
- On API failure: returns `false` (fail-open), logs warning
- Timeout: 10 seconds

### Method: `filterCandidatesWithOpenPRs()` (enhanced)

- Takes `Issue[]`, returns `Promise<Issue[]>`
- For each candidate:
  - If `externalId` is non-null: calls `hasOpenPRForExternalId(externalId)`
  - Else: calls `hasOpenPRForIdentifier(identifier)`
- Runs checks in parallel via `Promise.allSettled()`
- Candidates where the check resolves to `true` are excluded
- Candidates where the promise rejects are included (fail-open)
- Excluded candidates logged at `info` level

### Wiring in `asyncTick()`

- Remains between `fetchCandidateIssues()` and `applyEvent()` (step 1b)
- No change to wiring — the filter method signature is unchanged

### File Layout

No new files beyond tests:

- `packages/orchestrator/src/orchestrator.ts` — new `hasOpenPRForExternalId()` method, enhanced `filterCandidatesWithOpenPRs()`
- `packages/orchestrator/tests/orchestrator-pr-guard.test.ts` — extended with externalId-based tests

### Data Structures

No new types. Reads `externalId: string | null` and `identifier: string` from existing `Issue` type.

## Success Criteria

1. When [candidate has an `externalId` and an open PR linked to that issue], the system shall [exclude it from dispatch].
2. When [candidate has an `externalId` and no open PR linked to that issue], the system shall [dispatch it normally].
3. When [candidate has no `externalId`], the system shall [fall back to checking `feat/<identifier>` branch].
4. When [candidate has a non-GitHub `externalId`], the system shall [fall back to checking `feat/<identifier>` branch].
5. If [`gh` API call fails for externalId check], then the system shall [dispatch the candidate and log a warning].
6. If [`gh` API call fails for identifier check], then the system shall [dispatch the candidate and log a warning].
7. The system shall not [modify the Issue type, tracker adapter interface, or state machine logic].
8. All new code has unit test coverage.
9. Existing orchestrator tests continue to pass.

## Implementation Order

1. **Phase 1: Add externalId-based check** — Implement `hasOpenPRForExternalId()` with unit tests
2. **Phase 2: Enhance filter** — Update `filterCandidatesWithOpenPRs()` to prefer externalId, fall back to identifier
3. **Phase 3: Integration tests** — Full tick tests with mixed candidates (externalId, no externalId, API failures)
4. **Phase 4: Verify** — Run full orchestrator test suite

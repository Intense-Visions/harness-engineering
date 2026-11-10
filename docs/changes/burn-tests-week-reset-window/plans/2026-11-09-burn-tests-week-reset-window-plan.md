# Burn tests fail in the hour after the Monday 00:00 UTC week reset (#1966)

## Root cause

The burn suite wrote fixture rows relative to the wall clock and then let the
summary read the wall clock too:

- `packages/burn/tests/summary-attribution.test.ts` (9 tests) and
  `packages/burn/tests/scan.test.ts:51` (`dedupe > collapses repeated usage blocks`)
  wrote rows at `hoursAgo(new Date(), 1)` under `DEFAULT_WEEK`
  (`packages/burn/tests/helpers.ts:86`, Monday 00:00 UTC) and called
  `refresh(h.paths)` / `recompute(h.paths)` with no `now`.
- `refresh`/`recompute` default `now` to `new Date()` (`packages/burn/src/refresh.ts:9,17`)
  and `buildSummary` buckets rows by `weekBounds(now, cfg)` (`packages/burn/src/summary.ts:102`).

Between Monday 00:00 and 01:00 UTC a row written one hour ago is in the
previous week, so the week-to-date rollup is empty and every week-sized
assertion fails — on every OS, deterministically, and only inside that window.
A re-run outside the window is green, which is why it read as a flake.

The sweep found a second instance of the same class:
`scan.test.ts > abstention > does not suppress an elevated status on a thin sample`
anchors the week at today's UTC weekday 00:00 and writes its row
`minutesAgo(now, 5)`, so it fails in the first 5 minutes after every UTC
midnight. The sibling `downgrades a would-be OK to EARLY` test has the same
shape.

## Evidence (positive control)

A throwaway vitest setup file faked only `Date` (`vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })`

- `vi.setSystemTime(BURN_FORCE_NOW)`) to force the in-process clock. Same command,
  same output:

| Tests                 | Mon 00:30Z                             | Tue 00:02Z                     | Wed 12:00Z |
| --------------------- | -------------------------------------- | ------------------------------ | ---------- |
| origin/main (unfixed) | **10 failed** (exactly the issue's 10) | **1 failed** (elevated-status) | 152 passed |
| fixed                 | 152 passed                             | 152 passed                     | 152 passed |

Fixed suite on the real wall clock, no probe: 163/163 passed, x3 via
`pnpm --filter @harness-engineering/burn test`.

`config-units.test.ts` was excluded from the probe runs only: its
`refresh throttling` tests compare `now` against real file mtimes, so a faked
`Date` breaks them at ANY forced instant (they fail at mid-week Wed 12:00Z too,
fixed or unfixed). That is a probe artifact, not this defect — and it is the
reason the fix injects `now` rather than faking timers.

## Fix

Pin the clock by injection, the pattern `summary-rollup.test.ts` and
`summary-cost.test.ts` already use (`NOW = 2026-08-12T12:00:00Z`):

- `tests/helpers.ts`: export `MID_WEEK = new Date('2026-08-12T12:00:00Z')`
  (Wednesday 12:00 UTC: 2.5 days past a DEFAULT_WEEK reset, 12h past UTC midnight)
  with a comment stating the rule.
- `summary-attribution.test.ts`: every fixture time derives from `MID_WEEK` and
  every `refresh`/`recompute` call passes `MID_WEEK`.
- `scan.test.ts`: the `dedupe` and `abstention` tests use `now = MID_WEEK` and
  pass it to `refresh`.

Why injection over fake timers: `buildSummary`/`refresh`/`recompute` already
accept `now` ("injectable so the suite can place itself anywhere in a week",
`src/summary.ts:92`), it reaches exactly the clock the summary uses, and it does
not desynchronise `Date` from filesystem mtimes (`refreshIfStale`,
`src/refresh.ts:35`) or the lock's `Date.now()` busy-wait (`src/store.ts:93`).

## Sweep — patterns checked and left alone

- `concurrency.test.ts`, `bin-startup.test.ts`: spawn the built bin (real child
  clock), but assert only on the record store / startup, which is not
  week-windowed (scan/store never read `now`).
- `scan-attribution.test.ts`, `store-attribution.test.ts`, `robustness.test.ts`,
  `scan.test.ts > data loss`, `config-units.test.ts`: `new Date()`-relative rows
  but assertions on stored records / fingerprints / `records_total`, not the
  week rollup. Confirmed by the probe: none fail at any forced instant (except
  the mtime artifact above).
- `budgets-models.test.ts`: derives the week config from `now`
  (`weekStartingDaysAgo` / `lateWeekConfig`), so it is boundary-safe by
  construction.
- `summary-rollup.test.ts`, `summary-cost.test.ts`, `statusline.test.ts`: already pinned.

## Remediation actions / assumptions

- Test-only change; no production code touched. Empty changeset.
- No test was skipped, retried, or loosened; assertions are unchanged.
- Assumption: the semantics of the two abstention tests ("thin sample") hold at
  12h into the week as they did at 5 minutes — verified, both still assert
  `confidence: 'low'` and pass.
- Residual (not fixed, documented): the child-process tests depend on the real
  clock only for store contents, which are time-independent.

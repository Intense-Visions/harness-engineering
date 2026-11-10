# Plan: dashboard client RTL wait budget (#2339)

## Symptom

`packages/dashboard/tests/client/pages/Maintenance.schedule.test.tsx:92` (first test in the file) failed on
`build-and-test (macos-latest, 22)` with `TestingLibraryElementError: Unable to find an element with the
text: main-sync`, DOM still showing `Loading maintenance status...`. Same commit green on ubuntu and windows;
the file took 31.8 s for 14 tests on that runner, and passes alone on an idle Mac.

## Root cause

The first-render `waitFor` runs under React Testing Library's default `asyncUtilTimeout` of **1000 ms**
(no setup file configured it: the `client` project in `packages/dashboard/vitest.config.mts` had no
`setupFiles`). In `@testing-library/dom`'s `waitFor` (`dist/wait-for.js`, `handleTimeout`), the overall
timeout rejects with the last callback error and does **not** re-check the callback, so if wall-clock passes
1000 ms before React commits the loaded state, a correct assertion fails on the loading DOM.

The test itself is not mis-ordered:

- `useMaintenanceData` (`src/client/components/maintenance/useMaintenanceData.ts`) loads via
  `Promise.all([fetchStatus(), fetchHistory()])` then `loadScheduleOnly()`; every `fetch` in the test is a
  `vi.fn` returning an already-resolved promise, so the data path is pure microtasks.
- `mockConnected = true`, so `useInFlightPolling` (the only `setInterval`) is a no-op.
- The file never installs fake timers; the `waitFor` is awaited and RTL's `asyncWrapper` handles act().

So the only variable is how long the cold first render takes to settle on a loaded runner — a wait-budget
problem, not an ordering bug.

Investigation note: a single synchronous 1.2 s event-loop stall (busy-wait inside the mocked `json()`, run in a
microtask or a timer callback) did **not** reproduce the failure — React's commit task still ran before the
timers phase fired `handleTimeout`. The CI failure therefore needs the settle to be slow _across_ macrotasks
(a CPU-starved runner slowing every step), which is modelled by a mocked `json()` that resolves after 1500 ms.

## Fix

- New `packages/dashboard/tests/client/setup.ts`: `configure({ asyncUtilTimeout: 5_000 })`.
- Wire it via `setupFiles: ['./tests/client/setup.ts']` on the `client` project only.
- New `packages/dashboard/tests/client/setup.test.ts`: asserts the live `getConfig().asyncUtilTimeout` is
  > 1000 and < the configured `testTimeout` (15 000). It deliberately does not import `setup.ts`, so it fails if
  > `setupFiles` stops loading it.

No assertion was changed, no test skipped, no retries added. A passing query returns as soon as it matches;
the larger budget only costs time on a query that is about to fail anyway.

## Verification

- Positive control (scratch probe, not committed): first-render `waitFor` with `/status` `json()` resolving
  after 1500 ms. Old setup: FAIL with the exact CI signature (`Unable to find ... main-sync`, DOM
  `Loading maintenance status...`, probe printed `asyncUtilTimeout = 1000`). New setup: PASS, probe printed
  `asyncUtilTimeout = 5000`, settle at ~1515 ms.
- Config guard negative control: with `setupFiles: []`, `setup.test.ts` fails
  (`expected 1000 to be greater than 1000`); with the fix, 2/2 pass.
- `vitest run --project client tests/client/pages/Maintenance.schedule.test.tsx` x10: 10/10 runs, 14/14 tests each.
- Full client project: 107 files, 1047 tests passed.

## Remediation actions / assumptions

- Chose issue option 2 (global setup) over per-call `{ timeout }` so every cold-render `waitFor`/`findBy` in
  the client suite gets the same load-tolerant budget, matching the macOS timing class tracked in #2046/#2118.
- Assumes 5000 ms covers the observed worst case (failing test ran 2.7 s total on the loaded runner) while
  staying a third of the 15 s per-test timeout, so real failures still surface as RTL's DOM error.
- Assumes no client test relies on a `waitFor` timing out quickly as its expected behaviour; the full client
  suite passing (1047/1047) with no runtime blow-up supports this.
- Local reproduction of the CI flake itself was not possible on an idle Mac (passes 3/3 per the issue);
  the positive control models the condition instead.

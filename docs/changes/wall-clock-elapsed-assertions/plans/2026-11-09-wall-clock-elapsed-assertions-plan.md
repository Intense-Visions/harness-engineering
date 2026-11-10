# Wall-clock elapsed-time assertions (flake class) — diagnosis and fix

Refs #2046. Pipeline: `harness:debugging` (investigate → analyze → hypothesize → fix).

## Symptom

`packages/core/tests/security/injection-patterns.test.ts` failed macOS CI on
2026-09-06 (run `34030345441`): `expected 105.49 to be less than 100`. No code
under test changed; the runner was busier.

## Root cause

Each site encodes a _property_ (cache hit, parallel dispatch, no super-linear
cost) as a single absolute wall-clock sample `expect(elapsed).toBeLessThan(N)`.
A single sample measures runner load, JIT warm-up and I/O contention as much as
the code, so the assertion is nondeterministic. Worse, for the cache and
parallelism sites the budget is not even a proxy for the property: the old
`state-manager-cache.test.ts` tests **pass with the cache disabled** (proven
below), and the old fan-out test passes with a serial `for … await` loop.

## Sites (re-enumerated on origin/main `e962da1cc`)

| Site                                                                           | Property the budget stood for                          | Category              | New assertion                                                                                                                                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| core `tests/state/state-manager-cache.test.ts:39` (learnings)                  | unchanged mtime is served from memory, no disk re-read | (a) structural        | mutate file content behind the cache with a pinned mtime; hit must return the stale cached array (`toBe` identity, length 2), plus positive control: moved mtime re-reads (length 3) |
| core `tests/state/state-manager-cache.test.ts:110` (failures)                  | same                                                   | (a)                   | same shape (1 cached vs 2 on re-read)                                                                                                                                                |
| cli `tests/mcp/utils/graph-loader.test.ts:61` (5 ms!, not in the issue's list) | cache hit does no load                                 | (a)                   | hit performs exactly 1 stat, 0 loads, 0 constructions                                                                                                                                |
| core `tests/review/fan-out.test.ts:81`                                         | all agents dispatched before any is awaited            | (b) structural        | dispatch-order probe: wrapped agents log into a shared array; a microtask queued before fan-out must run only after all 4 dispatches                                                 |
| core `tests/security/injection-patterns.test.ts:280`                           | no super-linear (backtracking) regex cost on 10 KB     | (c) robust wall-clock | warm-up, best of K=5 samples, bound 50 ms (~150x local warm ~0.3 ms)                                                                                                                 |
| cli `tests/skill/dispatcher.perf.test.ts:59,73`                                | no super-linear scoring over 400 entries               | (c)                   | `bestOf(5)` after warm-up, bound 100 ms each (~35-80x local warm 3 ms / 1.2 ms)                                                                                                      |
| core `tests/state/learnings.test.ts:883`                                       | bounded per-append dedup overhead                      | (c)                   | median of 100 per-append samples < 80 ms (the per-append budget the old 8 s total implied)                                                                                           |

No load-independent cost proxy (op count) is exposed by `scanForInjection` or
`suggest()` without a production seam, so category (c) keeps a wall-clock guard
made robust per the brief: min-of-K is noise reduction of one deterministic
measurement, not a retry; the assertion runs once. The median over 100 appends
is the same idea for an I/O-bound loop (a contention burst moves a minority of
samples; a real regression moves all of them).

## Evidence (each mutation's diff printed with its result, then reverted)

- learnings cache bypass (`if (false && cached …)`): new test FAILS `expected 3 to be 2`.
- failures cache bypass: new test FAILS `expected 2 to be 1`.
- **Old** `state-manager-cache.test.ts` from origin/main under the same two bypasses: `6 passed` — the old tests were vacuous.
- serialize fan-out (`for … await runAgent`): FAILS `expected [ 'compliance' ] to deeply equal [ 'compliance', 'bug', …(2) ]`.
- catastrophic-backtracking injection rule (4 groups, ~3.7 ms/line): FAILS `expected 238.6 to be less than 50`.
- O(n^2) `suggest()` (rescore the index per entry): FAILS `expected 158.95 to be less than 100`.
- graph-loader cache bypass: FAILS `expected 1 to be +0` (and the sibling identity test).
- lock always backs off 100 ms per append: FAILS `expected 104.06 to be less than 80`.

Known detection floor (stated, not hidden): a milder cubic-backtracking rule
(3 groups, ~0.19 ms/line, ~36 ms per scan, ~100x slower) passes the 50 ms
injection guard. The old single-sample 100 ms guard also missed it; the new
guard is strictly tighter while being far less load-sensitive.

Stability: each affected file run 10x — 10/10 pass for all six; 6 concurrent
runs of the four core files — 6/6 exit 0 (132/132 tests each).

## Remediation actions / assumptions

- Test-only change; no production code touched, no test deleted or skipped.
- Assumption: CI warm costs are within ~10x of local (Apple Silicon); the
  bounds leave >=10x headroom over that and min-of-K/median absorbs transient load.
- Other `elapsed < N` sites exist outside the issue's scope and were left
  alone: orchestrator `workspace/hooks.test.ts:146`, `server/integration.test.ts:126`,
  `agent/backends/pi.test.ts:525`, `gateway/webhooks/delivery.test.ts:167`,
  `telemetry-latency.test.ts:154` (already coverage-aware), and dashboard
  `Routing.perf.test.tsx:67`. Most are timeout-fired-vs-hang guards (a different
  shape); they are candidates for a follow-up pass.
- The issue suggests moving budgets to `scripts/benchmark-check.mjs`; not done
  here (out of scope; the in-test guards now assert deterministic properties or
  robust super-linear-regression floors).

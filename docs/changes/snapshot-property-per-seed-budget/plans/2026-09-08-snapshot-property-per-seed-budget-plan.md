# Plan: split the SC2 snapshot property test into per-seed cases

**Date:** 2026-09-08 · **Driver:** windows-latest CI timeout on `main` @ `8e7a59800` (run `34271802379`, job `102214934241`) · **Tasks:** 4 · **Integration Tier:** small · **Refs:** #2046 (same defect class, different shape)

Produced by the `harness-debugging` pipeline (investigate → analyze → hypothesize → fix). Debug session: `.harness/debug/resolved/snapshot-property-win-timeout.md`.

## Symptom

```
 FAIL  tests/state/event-sourcing/snapshot.property.test.ts > SC2 — reduce(events) === readSnapshot() (property) > holds over 200 randomized seeds on both the computed and fresh-hit paths
Error: Test timed out in 60000ms.
 ❯ tests/state/event-sourcing/snapshot.property.test.ts:121:3
```

The file reported `66925ms` for that single test. ubuntu and macOS were green; only `build-and-test (windows-latest, 22)` failed.

## Root cause

`packages/core/tests/state/event-sourcing/snapshot.property.test.ts:121` is **one** `it()` that loops `seed = 1..200`, and vitest's timeout budget is **per test**, not per unit of work. Every seed's real filesystem I/O is therefore billed to a single 60s budget, which makes the total wall-clock of 200 seeds an implicit, machine-speed-dependent assertion. The logic is fully deterministic (pinned mulberry32 seeds) — nothing about the _correctness_ of the property varies by platform. Only the _speed_ does.

The I/O volume under that one budget, measured by replaying the pinned PRNG (`scratchpad/count-events.mjs`, reproduced in the session log):

| Quantity                                          | Value    |
| ------------------------------------------------- | -------- |
| Seeds                                             | 200      |
| Real `emitEvent` calls (each an `appendFileSync`) | **2974** |
| Mean events per seed                              | 14.9     |
| Max events in one seed                            | 30       |
| Seeds that emit zero events                       | 12       |

Each `emitEvent` is not one syscall. Reading the source at the pinned base:

- `emitEvent` (`packages/core/src/state/event-sourcing/log.ts:199`) → `eventLogPaths` → `getStateDir` (`state-shared.ts:38`, at least one `existsSync` on the streams index), then `fs.mkdirSync`, then `readTailSeq`, then `fs.appendFileSync`.
- `readTailSeq` (`log.ts:46`) is `existsSync` + a **full `readFileSync` of the growing log**, re-read on every append (`INV-2 helper ... Re-read every append`). Within a seed that is O(n²) in bytes read.

Per seed there is additionally one `mkdtempSync`, one `loadEvents`, two `readSnapshot` (each re-reading the tail), one `materialize` (`loadEvents` + `writeFileSync` + `renameSync`), and one recursive `rmSync`. That puts the file on the order of ~18,000 filesystem syscalls inside a single 60s budget.

Windows CI pays roughly 3.7ms per filesystem operation (66925ms / ~18,000) against roughly 0.1ms on this macOS host. That ratio — not any behavioural difference — is the entire failure. `vitest.config.ts` already sets `fileParallelism: false` on win32 and `testTimeout: 60_000`, so the runner was already serialized and already on a raised ceiling; the budget had simply been consumed by aggregation.

**This is a defect in the test's structure, not in `snapshot.ts` or `log.ts`.** `readTailSeq`'s re-read-per-append is a deliberate multi-writer correctness choice (INV-2), documented as such, and 30 events is well inside its intended range. No product change is warranted.

## Rejected alternatives

1. **Raise `testTimeout` further.** Leaves the wall-clock assertion in place and merely moves the cliff. The budget would still be consumed by 200 aggregated seeds, so the next slower runner (or the next added seed) reintroduces the same failure with no new signal. This is the shape #2046 already tracks; adding to it is not a fix.
2. **Reduce the seed count, `skip`, `skipIf(win32)`, or retry.** All remove or weaken coverage. The file's own header forbids it: "A failing seed is a real reducer/snapshot bug to fix — not a test to weaken."
3. **`it.concurrent` over the seeds.** Would genuinely cut wall-clock, but `buildLog` mutates `process.env.HARNESS_EVENT_WRITER_ID` and the module-level writer-id cache — process-global state. Concurrent seeds would clobber each other's writer identity and produce false failures. Rejected as unsound.

## Fix

Split the single `it()` into `it.each(SEEDS)` — one case per seed.

- Each seed gets **its own** 60s budget, so no single test's runtime is load-bearing. Total file wall-clock is unchanged (the same work runs), but vitest applies no per-file timeout, so the 66925ms Windows file no longer fails.
- `afterEach` now reclaims **that seed's** temp dir immediately instead of holding all 200 live until the end of the run.
- Failures name the seed (`... — seed 137`) rather than reporting one opaque aggregate failure.
- Cases stay **sequential** (vitest's default within a file) — required, per rejected alternative 3.
- **Coverage is identical: all 200 seeds still execute on every OS.** The reporter now shows 200 named cases, which is what makes that self-evident rather than asserted.

Alongside, the four `if (!x.ok) return;` narrowing guards are replaced with a local `expectOk` helper that **throws**. At the pinned base those `return`s were unreachable (the preceding `expect(...).toBe(true)` throws first), but a `return` inside a per-seed case would exit that case _green_ having asserted nothing. `expectOk` removes that silently-green path by construction and surfaces the underlying `Result.error` message instead of a bare `expected false to be true`.

## Observable Truths (Acceptance Criteria)

1. The reporter lists 200 distinct passing cases for the file.
   **Gate:** `pnpm vitest run tests/state/event-sourcing/snapshot.property.test.ts --reporter=verbose` → `Tests  200 passed (200)`.
2. Seeds 1..200 are each named exactly once — no seed dropped by the refactor.
   **Gate:** verbose output greps to 200 unique `seed N` labels covering 1..200.
3. No single case is anywhere near its 60s budget.
   **Gate:** slowest per-case duration from the verbose reporter is < 1000ms on this host, i.e. > 60x margin.
4. Stable green across repeated runs.
   **Gate:** 3 consecutive runs of the file, all green.
5. No source file under `packages/*/src/` is modified (test-only change; no changeset required per `scripts/check-changesets.mjs` `SKIP_FILE`).
   **Gate:** `git diff --name-only origin/main...HEAD`.
6. Whole-tree formatting is clean.
   **Gate:** `pnpm format:check` exits 0.

## Tasks

1. Replace the aggregate `it()` with `it.each(SEEDS)`; hoist the per-seed body unchanged.
2. Add `expectOk` and replace the four `if (!x.ok) return;` guards.
3. Verify truths 1–4 (verbose run + seed-coverage grep + 3x repeat).
4. Verify truths 5–6 and push.

## Assumptions

- **The 66925ms is dominated by filesystem latency, not by a hang or a behavioural difference.** Supported by: ubuntu and macOS pass the same deterministic seeds; the per-op cost implied by the ratio (~3.7ms) is ordinary for Windows CI with real-time AV scanning of a temp directory. Not directly measured — see "Could not verify".
- **vitest applies no per-file timeout**, only per-test (`testTimeout`) and per-hook (`hookTimeout`). If a per-file ceiling existed, the split would not help.
- The Windows leg runs `pnpm test -- --continue` (no coverage instrumentation); coverage load is therefore not a contributing factor on that leg.

## Could not verify

- **The Windows timeout was not reproduced locally.** This work was done on macOS, the leg that passed in CI. The measured local wall-clock is ~0.4–1.9s against the 60000ms budget, so the margin here is ~30–150x and the failure cannot manifest. The evidence that the budget is the binding constraint is the measured Windows/macOS ratio plus the syscall accounting above, not a local reproduction.
- Post-fix behaviour on windows-latest is confirmed only by this PR's own CI run, not locally.

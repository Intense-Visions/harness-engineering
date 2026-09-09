# Plan: make the comprehend-smoke teardown tolerate a locked Windows handle

**Date:** 2026-09-09 · **Trigger:** CI run [`34301348937`](https://github.com/Intense-Visions/harness-engineering/actions/runs/34301348937), job `build-and-test (windows-latest, 22)`, sha `b169ca0dc` · **Issue:** #2089 · **Tasks:** 3 · **Time:** ~30 min · **Integration Tier:** small

Remediation for a Windows-only **teardown** failure in an otherwise fully green leg. The job
reported `Test Files 1 failed | 733 passed | 5 skipped` with **zero failed tests** — every
assertion passed and the suite was reded by a failed `rmdir`.

## Goal

Make `packages/cli/tests/comprehension/comprehend-smoke.e2e.test.ts`'s `afterAll` wait for the OS
to release the file handles its spawned children held, instead of failing the instant it finds one
still open — so a passing suite stops reporting the product as broken.

## Root cause

The `describe` block spawns processes into its temp project at two points, both with `cwd: proj`:

- `beforeAll` (`:51-56`) runs four `spawnSync('git', ...)` calls to scaffold a real repo.
- `comprehend()` (`:24`) runs `spawnSync(process.execPath, [BIN, 'comprehend', ...])`; the block's
  assertions invoke it eight times in total.

`spawnSync` returns when the child **exits**, but on Windows the kernel releases that child's open
file handles asynchronously afterwards. Windows also refuses to unlink a file while a handle to it
is open. So `afterAll`'s recursive removal can start inside the window where handles under `proj`
are still live, and `rmdir` fails:

```
Error: EBUSY: resource busy or locked, rmdir 'C:\Users\RUNNER~1\AppData\Local\Temp\comprehend-smoke-b9n120'
 ❯ tests/comprehension/comprehend-smoke.e2e.test.ts:60:15
    59|   afterAll(() => {
    60|     if (proj) rmSync(proj, { recursive: true, force: true });
       |               ^
Serialized Error: { errno: -4082, code: 'EBUSY', syscall: 'rmdir', path: '...' }
```

The teardown already passed `force: true`, which reads like error tolerance but is not. Node
documents `force` as "exceptions will be ignored if `path` does not exist" — it suppresses
`ENOENT` only. Against a _locked_ path it does nothing, so the teardown had **zero** tolerance.

POSIX unlinks a file regardless of open handles, which is why this can only ever fire on the
Windows leg.

### This is the same fault the repo has already fixed four times

| File                                                                       | Remedy                                                          |
| -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `packages/core/tests/state/gate.test.ts:21`                                | `rmSync(..., { force: true, maxRetries: 10, retryDelay: 100 })` |
| `packages/cli/tests/commands/validate.roadmap-abstention.test.ts:78`       | same options, `retryDelay: 50`, wrapped best-effort             |
| `packages/orchestrator/tests/integration/orchestrator-sentinel.test.ts:92` | hand-rolled 3-attempt loop, 500ms backoff                       |
| `packages/orchestrator/tests/integration/claim-coordination.test.ts:126`   | hand-rolled 3-attempt loop, 500ms backoff                       |

(`packages/core/src/solutions/scan-candidates/*.test.ts` and `rework.test.ts` carry a third
variant, `maxRetries: 3, retryDelay: 100`.) The remedy is settled in this codebase; it had simply
never been applied to this file.

## Reproduction

**The Windows fault does not reproduce on macOS, and cannot.** It arises from Windows' refusal to
unlink files with open handles plus asynchronous handle release on process exit; POSIX has no
analogue. Per the `windows-ephemeral-port-deflake` precedent, the evidence standard here is:

> the teardown now tolerates a locked handle, and the suite is stable across repeated runs

and explicitly **not** "the Windows fault was reproduced locally".

The _mechanism_ was nevertheless verified experimentally rather than asserted. On macOS,
`chflags uchg` on a nested file makes `unlink` return `EPERM` — the same Node retry class as the
Windows `EBUSY` (`EBUSY, EMFILE, ENFILE, ENOTEMPTY, EPERM`) — giving a deterministic stand-in for
the lock. With the lock released by an **external** process ~700ms in (modelling the OS releasing
an exited child's handles):

| Probe | Options                                                         | Result                                   |
| ----- | --------------------------------------------------------------- | ---------------------------------------- |
| D'    | `{ recursive, force }` (current code)                           | `THREW EPERM after 2ms` — the CI failure |
| C'    | `{ recursive, force, maxRetries: 10, retryDelay: 100 }` (fixed) | `RECOVERED after 809ms`, tree removed    |

That pair is the revert protocol in mechanism form: identical lock, fatal without the options,
survivable with them. The probe was scratch-only and is not in the diff.

## Observable Truths (Acceptance Criteria)

1. The observed teardown tolerates a transiently locked path.
   **Gate:** line 60 carries `maxRetries` / `retryDelay`; the C'/D' probe pair above shows the
   options are load-bearing rather than decorative.
2. No assertion is weakened, skipped, or removed; the test count is unchanged.
   **Gate:** `Tests 15 passed | 1 skipped (16)` before and after. The 1 skip is the
   `HARNESS_E2E_LIVE`-gated live block, skipped by design in both.
3. The suite actually runs rather than silently skipping.
   **Gate:** the file is `describe.skipIf(!HAS_BIN)` against `dist/bin/harness.js`, so a missing
   build would report 0 tests and look green. `pnpm turbo build` precedes every run and the
   non-zero test count is the proof.
4. The suite is stable across repeated runs.
   **Gate:** 5 consecutive green runs of the affected file.
5. The nondeterminism is removed, not hidden.
   **Gate:** the diff contains no `skipIf(win32)`, no swallowing try/catch, no job-level retry, no
   `it.skip`, and no change to any assertion.

## Tasks

1. Add `maxRetries: 10` / `retryDelay: 100` to the `rmSync` at `:60`, with a rationale comment
   mirroring `packages/core/tests/state/gate.test.ts:21`.
2. Add a patch changeset describing the deflake.
3. Write the plan and debug-session artifacts (this file and its sibling).

## Assumptions and tradeoffs

- **Recommended-default taken: option values adopted verbatim from `gate.test.ts:21`**
  (`maxRetries: 10`, `retryDelay: 100`) rather than re-derived, and rather than the `retryDelay: 50`
  of the `validate.roadmap-abstention.test.ts` variant or the `maxRetries: 3` of the
  `scan-candidates` variant. `gate.test.ts` is the site the scope decision named as the precedent
  to mirror, and matching it exactly keeps the eventual shared-helper extraction a pure move.
- **Recommended-default taken: no `try`/`catch` wrapper.** The sibling precedent at
  `validate.roadmap-abstention.test.ts:78` wraps its retrying `rmSync` in a swallowing `catch` on
  the reasoning that leaking a temp dir beats failing a green suite. That is not adopted here: a
  bare catch would make a _permanent_ lock invisible, and the fleet's Iron Law requires the
  nondeterminism to be removed rather than hidden. If the retries are ever exhausted, that is a new
  and different fault and it should be loud.
- **Assumption:** the Windows handle-retention window fits inside the retry budget. Unverifiable
  from macOS. All four in-repo precedents rest on the same assumption and none has been observed to
  exhaust its retries.
- **Recorded cost:** on a _permanently_ locked tree the call takes ~24s before throwing (measured),
  because `rmSync(recursive)` applies the retry budget at each level of the tree rather than once.
  This only applies where the old code fails the suite outright anyway. On POSIX, and on any
  Windows run where no handle is held, the options cost nothing.
- **Classified a flake by failure MODE, not by a rerun flip.** The classification rests on the
  failure being `syscall: 'rmdir'` in `afterAll` with zero failed assertions across two independent
  occurrences (runs `34301348937` and `34279126634`), not on a same-SHA green.

## Not fixed here, reported instead

- **14 further sites in this same file.** Lines 146, 217, 218, 276, 293, 294, 319, 388, 403, 422,
  442, 466, 508 and 522 are structurally identical recursive `rmSync` teardowns, each removing a
  directory a `spawnSync`-ed CLI wrote into. Every one carries the same latent Windows fault; only
  line 60 has been observed red. They are left untouched because the scope decision for this item
  named line 60 specifically, and because the precedent decision on the sibling
  `windows-ephemeral-port-deflake` item (fork F5) chose "fix only the observed sites, route the
  rest". Surfaced here for routing — they are the natural first customer for the shared helper.
- **#2089's structural half.** The shared `removeTempDirSafely(dir)` helper and the migration of
  the four ad-hoc sites are deliberately out of scope for this PR. #2089 stays **open**.

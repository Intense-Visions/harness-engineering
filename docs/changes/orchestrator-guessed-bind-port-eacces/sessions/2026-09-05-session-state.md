# Session state: orchestrator guessed-bind-port EACCES deflake

**Fleet:** cicd-fleet · **Item:** Windows ephemeral-port EACCES · **Date:** 2026-09-05 · **Pipeline:** harness-debugging
**Branch:** `fix/orchestrator-bind-eacces-unhandled-rejection` · **Base:** `origin/main` @ `c1ca02ba2`
**Tracking issue:** #1827 (referenced, **not** closed — the human decides closure)

## Trigger

CI run `33905194260`, job `101128702125` (`build-and-test (windows-latest, 22)`), main sha `63dab6b58`, 2026-09-04.

```
Vitest caught 1 unhandled error during the test run.
Error: Orchestrator API failed to bind 127.0.0.1:49853: listen EACCES: permission denied 127.0.0.1:49853
 ❯ Server.onError packages/orchestrator/src/server/http.ts:837:11
   emitErrorNT (node:net:1977:8) → processTicksAndRejections
Serialized Error: { code: 'EACCES', errno: -4092, syscall: 'listen', address: '127.0.0.1', port: 49853 }
```

**All 617 test files PASSED.** The job went red purely on a process-level unhandled error, not on any
assertion. `Test Files N passed` in a Vitest log is therefore not evidence a job was green.

Cause classification: **flake — by failure MODE.** See "Honesty clause" below; this is explicitly
_not_ a rerun-proven classification.

## Honesty clause (restated verbatim in the PR body)

**There is NO same-SHA rerun evidence for this failure — every `ci.yml` run in the window is
`attempt: 1`, so no run of `63dab6b58` was ever retried. Under the fleet's Iron Law this item is
therefore classified as a flake by failure MODE (an OS-level port-permission race, on a job where
every test passed), not proven by a rerun flip.**

Second limit, stated so nobody reads more into this than the evidence supports: **port 49853 is not
attributable to any in-tree guessed range.** The ten guessed ranges span 10000-19999, 20000-29999,
30000-39999, 31000-40999, 32000-41999, 33000-42999, 35000-44999 and 51000-54999 — 49853 is in none of
them. This change removes a _proven, reproducible_ generator of that failure mode; it is **not**
demonstrated to be the sole cause of that one observed bind.

## Phase log

- **INVESTIGATE** — read the complete error, not the first line. `errno -4092` is libuv `UV_EACCES`;
  the frame is the `new Error(...)` inside the `onError` handler installed by
  `OrchestratorServer.start()` (`src/server/http.ts:834-841`). Established that `start()`'s
  reject-on-bind-failure contract is **correct** and was added deliberately in `4830b8faf` (#1249) to
  convert a 120 s hang into an attributable error — so the defect is upstream of it: _what port the
  caller asks for._
- **ANALYZE** — found the working reference in-tree. `src/server/http.ts:861-866` already states the
  rule: _"Tests should bind 0 and read this instead of guessing a random port, which collides."_
  `4830b8faf` established that contract and migrated the 12 sites in `tests/server/http.test.ts`, then
  stopped. Ten sites across nine files never adopted it — the same defect recurring in the files that
  commit did not reach. Independently re-derived the same ten sites that #1827 enumerates.
- **HYPOTHESIZE** — H1: _a listener constructed on a guessed port can fail to bind; the same listener
  constructed on port 0 cannot._ Falsifiable by occupying a port and attempting both.
  **CONFIRMED** (see Verification, Phase 3 rows).
- **FIX** — migrated all ten sites to bind `0` and read the port back, and added an executable guard
  so the pattern cannot silently return a third time.

## Root cause

Ten test sites construct a listener on a **guessed** port (`Math.floor(Math.random() * N) + BASE`)
instead of binding `0` and reading the OS-assigned port back.

On Windows this has two independent failure sources, and **both surface as `EACCES`, not the
`EADDRINUSE` a POSIX-trained reader expects**:

1. **WinNAT / Hyper-V excluded port ranges** reserve contiguous blocks inside the dynamic range
   (`netsh interface ipv4 show excludedportrange protocol=tcp`); a bind into a reserved block is
   refused with `WSAEACCES` (10013) → `UV_EACCES` → `errno: -4092`, exactly as logged.
2. **`SO_EXCLUSIVEADDRUSE`**, which libuv sets on Windows TCP listeners, so binding a port another
   socket already holds exclusively also returns `WSAEACCES`.

Binding `0` can hit neither: the OS only ever returns a port it has already reserved for that socket.

## Fix

Mechanical, one transform per site. **No retry, no skip, no sleep, no widened range, no lowered
assertion** — the race is _deleted_, not managed.

| Site kind            | Transform                                                               | Files                                                                                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OrchestratorServer` | construct with `0`, read `server.boundPort` after `start()` resolves    | `tests/integration/amr-routing-endpoints-e2e.test.ts`, `tests/integration/spec-b-phase-5-http-ws.test.ts` (×2), `tests/server/integration.test.ts`, `tests/server/local-model-broadcast.test.ts`, `tests/server/lmlm-phase7-e2e.test.ts` |
| raw `http.Server`    | `listen(0, '127.0.0.1')`, read `(server.address() as AddressInfo).port` | `tests/server/static.test.ts`, `tests/server/websocket.test.ts`, `tests/server/routes/chat-proxy.test.ts`, `tests/server/routes/plans.test.ts`                                                                                           |

Plus `packages/orchestrator/tests/server/bind-port-hygiene.test.ts` — asserts no file under
`packages/orchestrator/{src,tests}` derives a bind port from `Math.random()`. A partial migration is a
latent recurrence (this is the second occurrence); the guard closes that loop. It asserts the
**absence of the antipattern**, not the presence of a retry.

## Repeated-run evidence

A single green run is the flake's own signature, not proof. All runs on macOS / Node 22, in the
worktree at `c1ca02ba2` + this change.

| Evidence                                                                                                                                                                                                                                         | Iterations | Result                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 3 repro — `OrchestratorServer` on an occupied **specific** port                                                                                                                                                                            | 1          | **REJECTED**: `Orchestrator API failed to bind 127.0.0.1:55734: listen EADDRINUSE: address already in use 127.0.0.1:55734` — byte-for-byte the wrapper shape from CI, confirming the code path |
| Phase 3 repro — `OrchestratorServer` on **port 0**                                                                                                                                                                                               | **200**    | **200/200 resolved**, every `boundPort > 0`, zero failures                                                                                                                                     |
| Affected suites (11 files, 62 tests) — `bind-port-hygiene`, `static`, `websocket`, `local-model-broadcast`, `lmlm-phase7-e2e`, `integration`, `routes/plans`, `routes/chat-proxy`, `http`, `spec-b-phase-5-http-ws`, `amr-routing-endpoints-e2e` | **10**     | **10/10 green — 62/62 tests each, 620/620 total, 0 unhandled errors in every iteration**                                                                                                       |
| Full `packages/orchestrator` suite (2885 tests)                                                                                                                                                                                                  | **3**      | **3/3 green — 2884 passed, 1 skipped, 0 unhandled errors in every iteration**                                                                                                                  |

Aggregate: **13 repeated full/targeted iterations + 200 bind-0 iterations, zero unhandled errors,
zero bind failures.** Deterministic, not merely green once.

## Verification gates

| Gate                                                                                              | Result                                                                                                         |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `tsc --noEmit` (`packages/orchestrator`)                                                          | **PASS** (exit 0)                                                                                              |
| #1827 acceptance grep — no guessed bind ports remain                                              | **PASS** — `grep -rn "Math.random" packages/orchestrator/tests \| grep -i port` → no matches                   |
| Regression guard with the migration **reverted**                                                  | **FAILS**, enumerating all ten sites — mandatory revert-and-fail proof that the guard actually catches the bug |
| Regression guard with the migration **applied**                                                   | **PASS**                                                                                                       |
| Local pre-push gate chain (changeset-check, format:check, coverage, reference-docs, tool-catalog) | **PASS** — pushed with **no `--no-verify`** anywhere                                                           |
| No assertion weakened, skipped, retried or deleted                                                | **CONFIRMED** — the diff adds bind-0 reads and one guard; it removes only `Math.random()` port assignments     |

### Disclosed out-of-scope observation

`tests/integration/telemetry-latency.test.ts` (a wall-clock p99 budget assertion) failed **once**
during a full-parallel local run. It is **outside the diff** (`git diff --name-only` does not list
it), passes **3/3** in isolation, and did **not** recur in any of the three subsequent full-suite
runs. Local load flake on the dev machine, not caused by this change. Recorded rather than buried.

## Not fixed here — `needs-design`, escalated to a human

`packages/orchestrator/src/orchestrator.ts:4993` is `void this.server.start();` — the **only floating
`OrchestratorServer.start()` in the tree**. Because `start()` rejects on bind failure by design, a
production bind failure there becomes a process-level unhandled rejection: no operator-facing message,
no failed startup, and under Vitest a red job. **That is the amplifier** that converts any single bind
failure into a whole-job failure.

Deliberately left alone: fixing it means choosing between fail-fast, log-and-degrade and
retry-on-EACCES for orchestrator startup — a product decision, not a deflake — and a bare `.catch()`
would _hide_ the failure, which this sweep is forbidden to do.

## Also deliberately untouched

- `tests/server/http.test.ts:537-548` — binds `first.boundPort`, an OS-assigned value, as a
  **deliberate** collision, correctly awaited via `expect(...).rejects`. Intended design, not a defect.
- `tests/integration/orchestrator-local-resolver.test.ts:744,831` — already migrated on `main`.
- `packages/orchestrator/src/server/routes/v1/webhooks.test.ts` — owned by another lane this run.
- `docs/roadmap.d/`, `packages/cli/src/commands/`, `docs/knowledge/decisions/`, `.github/workflows/` —
  owned by other lanes this run.

## Status

`resolved` — PR **#1866**, OPEN and **UNMERGED**. Never merged, never auto-merged, never `--no-verify`.
Debug session record at `.harness/debug/resolved/orchestrator-guessed-bind-port-eacces.md` (gitignored
path via `.harness/.gitignore:4`; mirrored here for that reason).

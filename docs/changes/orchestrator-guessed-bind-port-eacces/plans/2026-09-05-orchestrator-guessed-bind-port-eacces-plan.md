# Plan — Remove the guessed-bind-port flake generator in `packages/orchestrator`

Date: 2026-09-05
Slug: `orchestrator-guessed-bind-port-eacces`
Branch: `fix/orchestrator-bind-eacces-unhandled-rejection`
Base SHA: `c1ca02ba2`
Pipeline: `harness-debugging` (investigate -> analyze -> hypothesize -> fix)
Debug session: `.harness/debug/resolved/orchestrator-guessed-bind-port-eacces.md` (local, gitignored — its content is summarized here)
Refs: #1827

---

## 1. Trigger

CI run [`33905194260`](https://github.com/Intense-Visions/harness-engineering/actions/runs/33905194260),
job `101128702125` = `build-and-test (windows-latest, 22)`, main SHA `63dab6b58`, 2026-09-04.

```
Vitest caught 1 unhandled error during the test run.
Error: Orchestrator API failed to bind 127.0.0.1:49853: listen EACCES: permission denied 127.0.0.1:49853
 ❯ Server.onError packages/orchestrator/src/server/http.ts:837:11
   emitErrorNT (node:net:1977:8) → processTicksAndRejections
Serialized Error: { code: 'EACCES', errno: -4092, syscall: 'listen', address: '127.0.0.1', port: 49853 }
```

**All 617 test files passed.** The job went red purely on a process-level unhandled error.

## 2. Root cause

Ten test sites across nine files construct a listener on a **guessed** port
(`Math.floor(Math.random() * N) + BASE`) instead of binding `0` and reading the OS-assigned port back.

A guessed port is not merely a collision risk on Windows — it has two independent failure sources,
and **both surface as `EACCES`, not the `EADDRINUSE` a POSIX-trained reader expects**:

1. **WinNAT / Hyper-V excluded port ranges.** Windows reserves contiguous blocks inside the dynamic
   range (`netsh interface ipv4 show excludedportrange protocol=tcp`). A bind into a reserved block is
   refused with `WSAEACCES` (10013) → libuv `UV_EACCES` → `errno: -4092`, exactly as logged.
2. **`SO_EXCLUSIVEADDRUSE`.** libuv sets it on Windows TCP listeners, so binding a port another socket
   already holds exclusively also returns `WSAEACCES` rather than `WSAEADDRINUSE`.

`OrchestratorServer.start()` (`packages/orchestrator/src/server/http.ts:813-857`) rejects on bind
failure **by design** — that contract was added deliberately in `4830b8faf` (#1249) to convert a 120s
hang into an attributable error. The contract is correct. The defect is upstream of it: _what port the
caller asked for_. `http.ts:861-866` already states the intended rule:

> "Tests should bind 0 and read this instead of guessing a random port, which collides."

`4830b8faf` migrated the 12 sites in `tests/server/http.test.ts` and stopped there. These ten never
adopted the contract. This is the same defect recurring in the files that commit did not reach.

## 3. What is proven, and what is not

Stated explicitly so nobody reads more into this than the evidence supports.

- **Proven (Phase 3 minimal reproduction, this machine):** an `OrchestratorServer` constructed on an
  occupied specific port rejects from `start()` with the exact wrapper message from the CI log; the
  same server constructed on port `0` resolved **200/200** with `boundPort > 0` every time. Guessing is
  a real, removable source of this failure mode. Binding 0 removes it — the OS only ever returns a port
  it has already reserved for that socket.
- **NOT proven — no rerun evidence.** Every `ci.yml` run in the window is `attempt: 1`; SHA
  `63dab6b58` was never retried. Under the fleet's Iron Law this item is classified a flake by failure
  **MODE** (an OS-level port-permission failure on a job where every test passed), **not** by a rerun
  flip.
- **NOT proven — 49853 is not attributable to an in-tree guessed range.** The ten guessed ranges span
  10000-19999, 20000-29999, 30000-39999, 31000-40999, 32000-41999, 33000-42999, 35000-44999 and
  51000-54999. **49853 is in none of them.** So the single bind that reddened run 33905194260 asked for
  a port obtained some other way — most plausibly an OS-assigned value that was then re-bound. This
  change removes a proven generator of the same failure mode; it is **not** demonstrated to be the sole
  cause of that one observed bind.

## 4. Secondary finding — recorded, deliberately NOT fixed (`needs-design`)

`packages/orchestrator/src/orchestrator.ts:4993` is `void this.server.start();` — the only floating
`OrchestratorServer.start()` in the tree. Because `start()` rejects on bind failure by design, a
production bind failure there becomes a process-level unhandled rejection: no operator-facing message,
no failed startup, and under Vitest a red job. That is the **amplifier** that turns any single bind
failure into a whole-job failure.

It is not fixed here because fixing it means choosing between fail-fast, log-and-degrade, and
retry-on-EACCES for orchestrator startup — a product decision, not a deflake. A bare `.catch()` would
_hide_ the failure, which this sweep is explicitly forbidden to do. Recorded for a human.

## 5. Change plan

Mechanical, one transform per site. **No retry, no skip, no widened range, no sleep, no lowered
assertion** — those manage the race instead of deleting it and leave the flake latent.

### 5a. `OrchestratorServer` sites — construct with `0`, read `boundPort` after `start()` resolves

| File                                                  | Old line |
| ----------------------------------------------------- | -------- |
| `tests/integration/amr-routing-endpoints-e2e.test.ts` | 112      |
| `tests/integration/spec-b-phase-5-http-ws.test.ts`    | 102, 200 |
| `tests/server/integration.test.ts`                    | 63       |
| `tests/server/local-model-broadcast.test.ts`          | 52       |
| `tests/server/lmlm-phase7-e2e.test.ts`                | 287      |

### 5b. Raw `http.Server` sites — `listen(0, ...)`, read `(server.address() as AddressInfo).port`

| File                                     | Old line |
| ---------------------------------------- | -------- |
| `tests/server/static.test.ts`            | 41       |
| `tests/server/websocket.test.ts`         | 12       |
| `tests/server/routes/chat-proxy.test.ts` | 87       |
| `tests/server/routes/plans.test.ts`      | 54       |

### 5c. Regression guard (new)

`tests/server/bind-port-hygiene.test.ts` — scans `packages/orchestrator/{src,tests}` and asserts no file
derives a bind port from `Math.random()`. This encodes #1827's own acceptance criterion as an executable
gate so the pattern cannot silently return a third time. It asserts the **absence of the pattern**, not
the presence of a retry.

Out of scope, deliberately untouched:

- `tests/server/http.test.ts:537-548` (`rejects instead of hanging when the port is already in use`) —
  binds `first.boundPort`, an OS-assigned value, as a **deliberate** collision. That is the intended
  design and is correctly awaited via `expect(...).rejects`. Not a defect.
- `tests/integration/orchestrator-local-resolver.test.ts:744,831` — already migrated on `main`.
- `packages/orchestrator/src/orchestrator.ts:4993` — see §4.

## 6. Verification bar

1. `tsc --noEmit` clean for `packages/orchestrator`.
2. Regression guard **fails** with the migration reverted, naming all ten sites, and **passes** with it
   applied (mandatory revert-and-fail proof).
3. A single green run is a deflake's own signature, not proof — so the affected suites run repeatedly
   and every iteration must be green with **zero** unhandled errors.
4. Full `packages/orchestrator` suite green; any failure outside the diff must be proven out of scope
   before it is dismissed.

## 7. Results

| Check                                               | Result                                                                                                                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsc --noEmit`                                      | PASS (exit 0)                                                                                                                                                                                               |
| Phase 3 repro — specific port                       | REJECTED: `... failed to bind 127.0.0.1:55734: listen EADDRINUSE ...`                                                                                                                                       |
| Phase 3 repro — port 0                              | RESOLVED 200/200, every `boundPort > 0`                                                                                                                                                                     |
| Guard with fix reverted                             | FAIL — lists all 10 sites                                                                                                                                                                                   |
| Guard with fix applied                              | PASS                                                                                                                                                                                                        |
| Affected suites (11 files, 62 tests) x10 iterations | 10/10 green, 620/620 tests, 0 unhandled errors                                                                                                                                                              |
| Full orchestrator suite x4                          | see PR body                                                                                                                                                                                                 |
| `tests/integration/telemetry-latency.test.ts`       | Failed once under full-parallel load on the dev machine. **Outside the diff** (`git diff --name-only` does not list it); passes 3/3 in isolation. A local wall-clock perf flake, not caused by this change. |

## 8. Follow-ups

- Human decision on `orchestrator.ts:4993` (§4) — the floating `start()` promise.
- #1827 is referenced, **not** closed. This fleet does not auto-land; a human decides closure.

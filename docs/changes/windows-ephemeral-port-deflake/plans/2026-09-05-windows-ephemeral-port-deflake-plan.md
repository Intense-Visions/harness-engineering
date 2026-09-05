# Plan — Deflake the windows-latest EACCES ephemeral-port bind (CI run 33905194260)

Trace of the `harness-debugging` (INVESTIGATE -> ANALYZE -> HYPOTHESIZE -> FIX) run executed
autonomously in a cicd-fleet remediation lane for item R1.

- **CI run:** 33905194260, job 101128702125, `build-and-test (windows-latest, 22)`, sha `63dab6b5`
- **Classification:** flake (nondeterminism), not a product defect
- **Branch:** `fleet/cicd-win-port-deflake`, based on `origin/main` = `5cd661d74`

## Phase 1 — INVESTIGATE

### The evidence

The orchestrator suite reported `258 passed | 3 skipped` files and `2834 tests passed | 50 skipped`,
with **zero test failures**. The job nevertheless failed, on a single unhandled rejection:

```
Error: Orchestrator API failed to bind 127.0.0.1:49853: listen EACCES: permission denied 127.0.0.1:49853
 ❯ Server.onError packages/orchestrator/src/server/http.ts:837:11
Serialized Error: { code: 'EACCES', errno: -4092, syscall: 'listen', address: '127.0.0.1', port: 49853 }
```

The throw site is the bind-failure rejection path in `OrchestratorServer.start()`, which exists
deliberately so a bind failure surfaces as an attributable error rather than a hang. It did its
job; the fault it reported originated in
`packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts`.

### Reproduction — stated honestly

**The Windows fault does not reproduce on macOS, and no attempt is made to claim otherwise.**
`EACCES` on `listen()` for an otherwise-free port is Windows-specific: Hyper-V / WSL / Windows NAT
reserve ("exclude") ranges of ephemeral ports, and a bind into an excluded range is refused with
`EACCES` rather than `EADDRINUSE`. Port 49853 falls inside the range the test drew from.

The evidence standard adopted for this item is therefore:

> the guessed-port call sites are **gone**, and the suite is **stable across repeated runs** —
> _not_ "the Windows fault was reproduced locally".

### The call sites

Two sites in the failing file picked a port by guessing:

- `packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts:744`
- `packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts:819`

both `const port = 30000 + Math.floor(Math.random() * 20000);` — a range (30000..49999) that
overlaps the Windows excluded ranges. Each then set `(config as WorkflowConfig).server = { port }`
and called `await orch.start()`, which constructs and binds an `OrchestratorServer`.

Neither test needs a _specific_ port. Both only need the server **object** to exist so they can read
wired callbacks (`getLocalModelStatuses`, `getLocalModelStatus`) off it. The bind is pure collateral
and the guessed port is pure liability.

## Phase 2 — ANALYZE: the working example

The correct mechanism already exists in-tree and is already used correctly elsewhere:

- `packages/orchestrator/src/server/http.ts:843-869` — `listen()` accepts `0`; the `listening`
  handler reads `httpServer.address().port` and adopts the OS-assigned value.
- `packages/orchestrator/src/server/http.ts:868` — the `boundPort` getter, whose own doc comment
  reads: _"Tests should bind 0 and read this instead of guessing a random port, which collides."_
- `packages/orchestrator/tests/server/http.test.ts:464` — `binds an OS-assigned port when
constructed with 0 and exposes it as boundPort`, plus `server.boundPort` call sites throughout.

## Phase 3 — HYPOTHESIZE

### H1 — confirmed

The fault is a guessed port racing the Windows excluded ranges; binding `0` and reading `boundPort`
removes the guess and therefore the race. Verified against the mechanism above.

### H2 — confirmed by experiment, and it is a second latent bug

Binding `0` _through orchestrator config_ was **blocked**. `packages/orchestrator/src/orchestrator.ts:1386`
gated server construction on `if (config.server?.port)` — a **truthiness** test. `0` is falsy, so
`server = { port: 0 }` skipped construction entirely and left `orch.server` undefined.

This is not merely an obstacle to the fix; it contradicts the declared contract.
`packages/types/src/orchestrator.ts:1304-1307` declares:

```ts
export interface ServerConfig {
  /** Port to listen on (null to disable) */
  port: number | null;
}
```

The **documented disable sentinel is `null`**. `0` is a valid port meaning "OS-assigned ephemeral".
The truthy gate conflated `0` with `null`, making the port-0 support that `http.ts` explicitly
implements _and documents for exactly this use_ unreachable through config.

Blast radius is one line: `config.server.port` has exactly two readers, both in `orchestrator.ts`
(the gate at :1386 and the constructor argument at :1430).

**Falsifiable experiment run (one variable):** set both sites to port `0`, leave the gate untouched.
Prediction: both tests fail with `orch.server` undefined. Observed exactly that —
`TypeError: Cannot read properties of undefined (reading 'getLocalModelStatuses')` and
`... (reading 'getLocalModelStatus')`, `2 failed | 17 passed (19)`. Hypothesis confirmed.

## Phase 4 — FIX

### What changed

1. **`packages/orchestrator/src/orchestrator.ts:1386-1391`** — gate changed from
   `if (config.server?.port)` to `if (config.server?.port != null)`, with a comment recording why.
   `undefined` (no server config) and `null` (documented disable) both still skip construction;
   `0` now correctly reaches `OrchestratorServer`.
2. **`orchestrator-local-resolver.test.ts:744`** (now `:741-748`) — guessed port replaced with
   `{ port: 0 }` and a comment explaining why a guessed port is never acceptable here.
3. **`orchestrator-local-resolver.test.ts:819`** (now `:822-825`) — same.
4. **`orchestrator-local-resolver.test.ts:~778-786`** — added the regression assertions:
   `expect(server).toBeDefined()` and `expect(server.boundPort).toBeGreaterThan(0)`.

### The regression test catches the bug (revert protocol)

Mandatory revert-and-fail check, run against the final test code:

| Gate state                                     | Result                                                                                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Reverted to `if (config.server?.port)`         | **FAIL** — `AssertionError: server should be constructed when port is 0: expected undefined to be defined`, `2 failed \| 17 passed (19)` |
| Restored to `if (config.server?.port != null)` | **PASS** — `19 passed (19)`                                                                                                              |

The assertion is therefore a real guard, not decoration: it fails without the fix and pins the gate
against regressing to a truthiness test.

### What was deliberately NOT done

Per the hard constraints of the item:

- No test was skipped, `.only`-excluded, blanket-retried, or deleted.
- The random range was **not** widened; no retry loop around `listen`; no sleep. Those _manage_ the
  race — binding `0` _deletes_ it.
- The other 10 guessed-port sites in **other** files were left untouched; they are tracked as a
  separate follow-up by the cicd-fleet orchestrator.

## Verification

All runs on this branch, macOS, Node 24, after `pnpm install` + `pnpm turbo build`.

- **Typecheck:** `tsc --noEmit` on `@harness-engineering/orchestrator` — clean, exit 0.
- **Affected file, 5 consecutive runs, all green** (required stability evidence):

  | Run | Result                                             |
  | --- | -------------------------------------------------- |
  | 1   | `Test Files 1 passed (1)` / `Tests 19 passed (19)` |
  | 2   | `Test Files 1 passed (1)` / `Tests 19 passed (19)` |
  | 3   | `Test Files 1 passed (1)` / `Tests 19 passed (19)` |
  | 4   | `Test Files 1 passed (1)` / `Tests 19 passed (19)` |
  | 5   | `Test Files 1 passed (1)` / `Tests 19 passed (19)` |

- **Full orchestrator package, no regression:** `Test Files 260 passed | 1 skipped (261)`,
  `Tests 2883 passed | 1 skipped (2884)`.

Windows behaviour is verified by CI on the PR, not locally — see the reproduction note above.

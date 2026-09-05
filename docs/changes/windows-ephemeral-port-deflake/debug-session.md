# Debug Session: windows-latest EACCES ephemeral-port flake

Status: resolved
Started: 2026-09-05
Error: `Error: Orchestrator API failed to bind 127.0.0.1:49853: listen EACCES: permission denied 127.0.0.1:49853`
CI: run 33905194260, job 101128702125 (`build-and-test (windows-latest, 22)`), sha 63dab6b5

## Investigation Log

### Step 2 — Read the error carefully

- The orchestrator suite reported `258 passed | 3 skipped`, `2834 tests passed | 50 skipped`, ZERO test failures.
- The job died on ONE unhandled rejection, not a test assertion.
- Serialized error: `{ code: 'EACCES', errno: -4092, syscall: 'listen', address: '127.0.0.1', port: 49853 }`
- Thrown from `Server.onError` at `packages/orchestrator/src/server/http.ts:837`, which is the
  bind-failure rejection path added deliberately so a bind failure surfaces instead of hanging.
- Origin test file: `packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts`.

### Step 3 — Reproduce

- NOT reproducible on macOS (this dev host). EACCES-on-listen for an unused port is a Windows-specific
  behaviour: Hyper-V / WSL / Windows NAT reserve (exclude) ranges of ephemeral ports, and a bind
  into an excluded range is rejected with EACCES rather than EADDRINUSE.
- Confirmed the reported port 49853 falls inside the range the test draws from.
- Therefore the evidence standard for this item is: the guessed-port call sites are GONE, and the
  suite is stable across repeated runs. Not: "the Windows fault was reproduced locally."

### Step 5/6 — Trace to the call sites

Two sites in the failing file draw a port by guessing:

- `tests/integration/orchestrator-local-resolver.test.ts:744` -> `const port = 30000 + Math.floor(Math.random() * 20000);`
- `tests/integration/orchestrator-local-resolver.test.ts:819` -> same expression
  Range 30000..49999 overlaps the Windows excluded ranges. Port 49853 is in range.
  Both sites then set `(config as WorkflowConfig).server = { port }` and call `await orch.start()`,
  which constructs and binds an `OrchestratorServer`. Neither test actually needs a _specific_
  port: they only need the server OBJECT to exist so they can read wired callbacks off it. The bind
  is pure collateral, and the guessed port is a pure liability.

## Hypotheses

### H1 (confirmed): the fault is a guessed-port race against Windows excluded port ranges

Falsifiable prediction: the in-tree fix is to bind port 0 and let the OS assign.
Verified the mechanism already exists:

- `packages/orchestrator/src/server/http.ts:843-869` — `listen()` accepts 0; the `listening`
  handler reads `httpServer.address().port` and adopts it.
- `packages/orchestrator/src/server/http.ts:868` — `boundPort` getter, whose own doc comment reads
  "Tests should bind 0 and read this instead of guessing a random port, which collides."
- Correct usage precedent: `packages/orchestrator/tests/server/http.test.ts:464`.

### H2 (confirmed): binding 0 via orchestrator config is BLOCKED by a truthiness gate

`packages/orchestrator/src/orchestrator.ts:1386` gates server construction on `if (config.server?.port)`.
`0` is falsy, so `server = { port: 0 }` would SKIP construction entirely and leave `orch.server`
undefined -- both tests would fail on the callback assertions.
This is itself a latent bug, not merely an obstacle:
`packages/types/src/orchestrator.ts:1304-1307` declares
`interface ServerConfig { /** Port to listen on (null to disable) */ port: number | null; }`
The DOCUMENTED disable sentinel is `null`. `0` is a valid port meaning "OS-assigned ephemeral".
The truthy gate conflates `0` with `null` and so contradicts the declared contract, making the
port-0 support that `http.ts` explicitly implements and documents unreachable through config.
Blast radius is one line: `config.server?.port` has exactly two readers, both in orchestrator.ts
(the gate at :1386 and the constructor arg at :1430).

## Resolution

Resolved: 2026-09-05

**Root cause (two layers):**

1. The test guessed a port (`30000 + random*20000`) at two sites. On Windows, Hyper-V/WSL
   _excluded_ ephemeral-port ranges refuse a bind with `EACCES` (not `EADDRINUSE`). Port 49853
   landed in an excluded range. Guessing a port is a race against those reservations.
2. Binding `0` (the correct, already-implemented, already-documented remedy) was unreachable
   through orchestrator config: `orchestrator.ts:1386` gated server construction on a
   **truthiness** test, and `0` is falsy. `ServerConfig.port` is `number | null` documented as
   "null to disable", so the gate conflated the valid port `0` with the disable sentinel `null`.

**Fix:**

- `packages/orchestrator/src/orchestrator.ts:1386` — gate is now `config.server?.port != null`,
  so `undefined`/`null` still disable but `0` reaches `OrchestratorServer`.
- `orchestrator-local-resolver.test.ts` :744 and :819 — both guessed ports replaced with
  `{ port: 0 }`; the OS assigns a free port and the server adopts it.
- Added regression assertions: server is defined and `boundPort > 0`.

**Regression test:** `packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts`
Revert protocol satisfied — with the gate reverted the assertion fails
(`expected undefined to be defined`, 2 failed | 17 passed); restored, 19 passed.

**Verification:** typecheck clean; affected file 5/5 consecutive green runs; full orchestrator
package 2883 passed | 1 skipped, no regression.

**Learnings:**

- On Windows, a failed `listen()` on a _free_ port surfaces as `EACCES`, not `EADDRINUSE` —
  Hyper-V/WSL reserve ranges. Any "random port" in test code is a latent Windows CI flake.
- Never guess a port in a test. Bind `0` and read the bound port back.
- A truthiness gate on a numeric config value silently swallows the legitimate value `0`.
  Compare against the documented sentinel (`!= null`) instead.
- A green test summary with a non-zero job exit means the failure was an unhandled rejection
  outside the assertion path — read past the test totals.

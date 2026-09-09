# Debug Session: comprehend-smoke.e2e.test.ts EBUSY teardown flake (windows-latest)

Status: resolved
Started: 2026-09-09
Error: `Error: EBUSY: resource busy or locked, rmdir 'C:\Users\RUNNER~1\AppData\Local\Temp\comprehend-smoke-b9n120'`
CI: run [`34301348937`](https://github.com/Intense-Visions/harness-engineering/actions/runs/34301348937), job `build-and-test (windows-latest, 22)`, sha `b169ca0dc`
Prior occurrence: run [`34279126634`](https://github.com/Intense-Visions/harness-engineering/actions/runs/34279126634) (PR #2085)
Issue: #2089

## Investigation Log

### Step 1 — Entropy analysis (`harness cleanup`)

Ran against the worktree. Findings are entirely pre-existing and unrelated to the failure site:
documentation drift under `docs/standard/`, `docs/api/`, `docs/guides/` (RENAMED / NOT_FOUND
symbol and link drift) and ~560 dead-code entries dominated by `templates/` and `examples/`
scaffolding plus test `setup.ts` files. **Nothing** under `packages/cli/tests/comprehension/`.
No entropy signal contributed to this fault.

### Step 2 — Read the error carefully

- The job reported `Test Files 1 failed | 733 passed | 5 skipped` with **ZERO failed tests**.
  The prior occurrence on #2085 reported `8698 passed | 29 skipped`, again zero failures.
- Every assertion in the file passed. The failure is thrown from `afterAll`, i.e. **after** the
  `describe` block's assertions have all completed successfully.
- Serialized error: `{ errno: -4082, code: 'EBUSY', syscall: 'rmdir', path: '...' }`.
  `syscall: 'rmdir'` — the failing operation is directory removal, not any product code path.
- Thrown at `comprehend-smoke.e2e.test.ts:60:15`, which was:
  `if (proj) rmSync(proj, { recursive: true, force: true });`
- Therefore: a **teardown** defect, not an assertion defect and not a product defect. The suite
  reports the product as broken when nothing about the product misbehaved.

### Step 3 — Reproduce

**NOT reproducible on macOS (this dev host), and that is expected, not a gap.** The fault is a
Windows file-locking behaviour: Windows does not permit unlinking a file while another process
holds an open handle to it, and a just-exited child's handles are released asynchronously by the
OS. POSIX unlinks regardless of open handles, so the race has no macOS analogue.

Per the `windows-ephemeral-port-deflake` precedent, the evidence standard for this item is
therefore: **the teardown now tolerates a locked handle, and the suite is stable across repeated
runs** — NOT "the Windows fault was reproduced locally".

To avoid resting the diagnosis on assertion alone, the _mechanism_ was verified experimentally on
macOS using a deterministic stand-in for the lock (below).

### Step 4 — Check recent changes

`git log` for the file shows six commits, most recently `963422f28` (ADR 0116 docs) and
`f7d965949` / `e610043ce` (single-writer semantic). None of them touched the `afterAll` teardown.
The teardown has been unchanged since `e16942b16`, the commit that introduced the file. This is a
latent defect that has been present since the file landed, surfacing only now as CI load and
Windows runner contention shifted — consistent with it firing twice in four days.

### Step 5/6 — Trace the fault to its source

The failing `describe` block does two things that open Windows handles under `proj`:

1. `comprehend()` (`:24`) runs `spawnSync(process.execPath, [BIN, 'comprehend', ...])` with
   `cwd: proj`. Five of the block's assertions invoke it; the last one invokes it three times.
   Each spawned CLI reads and writes files under `proj` (`.harness/comprehension/math/_module.md`).
2. `beforeAll` (`:51-56`) runs four `spawnSync('git', ...)` calls with `cwd: proj`, creating a
   real `.git` directory. `git commit` in particular leaves index/object files freshly written.

`spawnSync` returns when the child exits, but on Windows the **kernel** releases that child's file
handles asynchronously. So `afterAll` can begin `rmSync` inside the window where handles under
`proj` are still open → `EBUSY` on `rmdir`.

## Hypotheses

### H1 (confirmed): `force: true` does not, and is not intended to, tolerate a locked path

Node's `force` option is documented as "If `true`, exceptions will be ignored if `path` does not
exist" — it suppresses `ENOENT` only. A locked path raises `EBUSY`/`ENOTEMPTY`/`EPERM`, which
`force` does not touch.

Falsifiable prediction: with `force: true` alone, a recursive `rmSync` over a tree containing an
undeletable entry throws immediately rather than being suppressed.

**Experiment.** On macOS, `chflags uchg` on a nested file makes `unlink` return `EPERM` — which is
in exactly the same Node retry class as the Windows `EBUSY` (`EBUSY, EMFILE, ENFILE, ENOTEMPTY,
EPERM`). This is a deterministic stand-in for the Windows lock.

```
A  force-only, locked entry:            THREW EPERM after 1ms
```

Confirmed. `force` did not suppress it, and it failed instantly — no tolerance whatsoever.

### H2 (confirmed): `maxRetries` / `retryDelay` makes the teardown survive a _transient_ lock

The real-world case is a lock that clears on its own within a few hundred milliseconds. The fix
is only worth anything if it recovers from that, rather than merely failing more slowly.

Falsifiable prediction: with an external process releasing the lock ~700ms in, the retrying
`rmSync` completes and removes the tree; the non-retrying one fails.

An initial attempt to test this released the lock from an in-process `setTimeout` and appeared to
refute the hypothesis (`THREW EPERM after 24539ms`). **That was a flaw in the probe, not a
property of the fix:** `rmSync` is synchronous and blocks the event loop, so the in-process timer
could never fire. Re-run with an external `/bin/sh` unlocker — which correctly models the OS
releasing an exited child's handles independently of our event loop:

```
C' transient lock + retries:     RECOVERED after 809ms; dir gone = true
D' transient lock, force only:   THREW EPERM after 2ms   <-- the CI failure
```

Confirmed, and this pair is the revert protocol in mechanism form: the same transient lock is
fatal without the options and survivable with them. The options are load-bearing, not decorative.

Note the cost profile: the retry consumes only the _actual_ settle time (809ms here), not a fixed
budget. It is not a sleep. On POSIX, where the lock never occurs, it costs nothing.

### Recorded observation — the retry ceiling is higher than the nominal backoff

A _permanently_ locked tree took `24148ms` to finally throw, not the ~5.5s a single linear
`100..1000` backoff would predict, because `rmSync(recursive)` applies the retry budget at
multiple levels of the tree (file, subdirectory, root). This is the worst case only when the lock
never clears — a scenario in which the old code fails the suite anyway. Deferrable, recorded so
the number is not a surprise to a future reader.

## Uncertainty surfacing

- **Assumption:** the Windows handle-retention window is shorter than the retry budget. The four
  in-repo precedents all assume this and none has been observed to exhaust its retries; the
  `gate.test.ts` budget is adopted unchanged rather than re-derived.
- **Deferrable (reported, not fixed):** this same file contains **15** recursive `rmSync` teardown
  sites, all structurally identical to line 60 and all reachable after a `spawnSync` of the CLI.
  Only line 60 has been observed red. Per the explicit scope decision for this item, only line 60
  was changed. See "Not fixed here" below.
- **Deferrable:** #2089's structural recommendation (a shared helper) is deliberately out of scope.

## Resolution

Resolved: 2026-09-09

**Root cause.** `comprehend-smoke.e2e.test.ts` scaffolds a scratch project with `git` and drives
the real `harness comprehend` binary via `spawnSync`, both with `cwd: proj`. On Windows the OS
releases an exited child's file handles asynchronously, so `afterAll`'s recursive `rmSync` can run
while handles under `proj` are still open, and `rmdir` fails with `EBUSY`. `force: true` does not
mitigate this — `force` suppresses "path does not exist", not "path is locked" — so the teardown
had no tolerance at all and reded a suite in which every assertion had passed.

**Fix.** `packages/cli/tests/comprehension/comprehend-smoke.e2e.test.ts:60` now reads:

```ts
if (proj) rmSync(proj, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
```

with a rationale comment mirroring the in-repo precedent at
`packages/core/tests/state/gate.test.ts:21`, whose option values (`maxRetries: 10`,
`retryDelay: 100`) are adopted verbatim. Node retries on exactly the `EBUSY`/`ENOTEMPTY`/`EPERM`
class in play, so the teardown waits for the OS to release the handles ("await the settle").

This removes the nondeterminism rather than hiding it. Explicitly NOT done, per the fleet's Iron
Law: the test is not skipped, not `skipIf(win32)`-ed, the teardown is not wrapped in a swallowing
try/catch, and no job-level retry was added.

**Regression test.** No new test file. The fault is an OS-level file-locking behaviour with no
POSIX analogue; a test asserting that `rmSync` honours `maxRetries` would be testing Node, not
this product, and would pass on the CI leg that never fails. The revert protocol is satisfied at
the mechanism level instead, by the C'/D' probe pair above: the identical transient lock is fatal
without the options (`THREW EPERM after 2ms`) and survivable with them (`RECOVERED after 809ms`).
This matches the evidence standard set by `docs/changes/windows-ephemeral-port-deflake/`.

**Verification.**

- Target file: **5/5 consecutive green** — `Test Files 1 passed (1)`, `Tests 15 passed | 1 skipped (16)`.
  The 1 skip is the `HARNESS_E2E_LIVE`-gated live block, skipped by design.
- The suite genuinely executes rather than silently skipping: the whole file is
  `describe.skipIf(!HAS_BIN)`, so `pnpm turbo build` was run first and the non-zero test count
  confirms `dist/bin/harness.js` was present.
- `tsc --noEmit` on `packages/cli`: exit 0.

**Not fixed here, reported instead.** The same file has 14 further recursive `rmSync` teardown
sites carrying the identical latent fault (lines 146, 217, 218, 276, 293, 319, 388, 403, 422, 442,
466, 508, 522 and the `counter` unlink at 294). Every one of them tears down a directory that a
`spawnSync`-ed CLI wrote into, so each is a future Windows red on the same mechanism. They were
left untouched because the scope decision for this item named line 60 specifically, and because
the precedent decision on the sibling item (`windows-ephemeral-port-deflake`, fork F5) chose
"fix only the observed sites, route the rest". Routing these is the natural first customer for
#2089's shared-helper half.

**Learnings.**

- `force: true` on `rm`/`rmSync` suppresses `ENOENT` **only**. It is routinely mistaken for
  general error tolerance; it gives a teardown no protection against a locked path.
- On Windows, an exited child's file handles are released asynchronously by the kernel.
  `spawnSync` returning is NOT a guarantee that the child's files are unlocked. Any test that
  spawns a process into a temp dir and then removes that dir recursively is a latent Windows flake.
- A green test total with a red job means the failure was outside the assertion path — read past
  the totals to the `syscall`. `syscall: 'rmdir'` names the culprit precisely.
- When probing a **synchronous** fs API, never release the contended resource from an in-process
  timer: `rmSync` blocks the event loop and the timer cannot fire. Use an external process, or the
  probe will refute a correct hypothesis.

# burn-runbin-stdin-epipe: an early-exiting HUD child turns EPIPE into an uncaught exception

Refs #2356 · cicd-fleet · harness-debugging session

## Symptom

macOS `build-and-test` run 42757126711 (PR #2355) reported `18 passed / 163 passed` and still
failed the job with `Errors 1 error`: `Uncaught Exception: Error: write EPIPE` at
`tests/helpers.ts:32:17 child.stdin.end(stdin)`. The error came from
`tests/concurrency.test.ts` "leaves a consistent store after six concurrent scans".

## Root cause

- `packages/burn/tests/helpers.ts:32` (origin/main e962da1cc), `runBin()` writes the payload with
  `child.stdin.end(stdin)` but never attaches an `'error'` listener to `child.stdin`.
- `packages/burn/src/bin/burn-hud.ts` `cmdScan()` (around line 111) and the `default` usage branch
  of `main()` **never read stdin**. Only `line`, `session-start` and `stop` call `readStdin()`.
  This is correct product behaviour: `scan` is a manual or forced refresh and Claude Code
  pipes nothing to it. A child running `scan` can therefore exit and close its end of the
  pipe before the parent's queued write flushes.
- When that happens, the pending write fails with a closed-pipe error (EPIPE on POSIX;
  ECONNRESET or EOF on win32 named pipes). Because no listener exists, Node throws it as
  an uncaught exception. Vitest then reports the error at job level even though every
  assertion passed.
- The six-concurrent-scan test spawns six such children at once under CI load. That
  widens the window between `spawn` and the libuv write. This is why the flake shows
  up there and is rare elsewhere.

This is a defect in the test helper, not the product. The binary may legitimately skip
stdin, so the harness that feeds it must tolerate a closed pipe. The orchestrator and core
use the same pattern for this exact class (#2298):
`packages/orchestrator/src/agent/backends/child-stdin.ts` `guardChildStdin` /
`isClosedPipeError`.

## Fix

In `packages/burn/tests/helpers.ts`:

- Extract the spawn/write/close logic into `runProcess(command, args, env, stdin)`.
  `runBin` delegates to it with the same signature and behaviour.
- Add `isClosedPipeError` and `guardChildStdin(stdin, onOtherError)`, mirroring the
  orchestrator predicate, because burn is a leaf package and cannot import orchestrator.
  `runProcess` attaches the guard before `stdin.end`. Closed-pipe errors are ignored
  because the `'close'` result (code, stdout, stderr) decides the outcome. Any other
  stdin error is forwarded to `reject`, so it still fails the test.

There are no retries, skips or loosened assertions. The concurrency test is unchanged.

## Regression test

`packages/burn/tests/run-process-stdin.test.ts`:

- A positive control proves that an 8 MiB write to `node -e 'process.exit(0)'`
  really does fail with a closed-pipe error on this platform.
- `runProcess` against an immediately-exiting child with an 8 MiB payload resolves
  `{stdout:'early', stderr:'', code:0}` and raises no uncaught exception.
- The same check with `process.exit(3)` reports `code: 3`, so the exit status still
  decides the outcome.
- `guardChildStdin` ignores EPIPE, ECONNRESET, EOF and ERR_STREAM_DESTROYED, and
  forwards EACCES.

8 MiB is larger than any OS pipe buffer, so the write cannot complete before the child
exits. The trigger is therefore deterministic, not a race.

## Evidence

- Revert-and-fail: with only the `guardChildStdin(child.stdin, reject)` line removed, the
  `runProcess` tests **failed 20/20** with `expected [ 'Error: write EPIPE' ] to deeply equal []`.
  With the line restored, the file **passed 20/20**.
- The full burn suite passed 5/5 times (171/171 tests, 0 errors).

## Remediation actions / assumptions

- Assumption: `scan` and usage not reading stdin is intended. The bin's header doc ties
  stdin reading to the hook payload, and `scan` is a manual command. No product change
  was made.
- I tolerate the full closed-pipe set (EPIPE/ECONNRESET/EOF/ERR_STREAM_DESTROYED), not only
  EPIPE, to match the repo's #2298 precedent. win32 named pipes report ECONNRESET or EOF for
  the same condition. Every other code is still forwarded.
- I searched for the same shape elsewhere: `grep -rnE "stdin\??\.(end|write)\(" packages/*/tests`.
  `packages/core/tests/review/ci/default-exec-file.test.ts:109` already handles `'error'`,
  and `packages/intelligence/tests/analysis-provider/claude-cli.test.ts` uses a mocked
  child. No other unguarded real-spawn helper was found.

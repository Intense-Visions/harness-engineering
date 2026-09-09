---
'@harness-engineering/cli': patch
---

fix(test): stop the comprehend smoke E2E reding windows CI from its teardown

`packages/cli/tests/comprehension/comprehend-smoke.e2e.test.ts` failed the
`build-and-test (windows-latest, 22)` leg twice in four days from its `afterAll`,
after every one of its assertions had already passed:

```
Error: EBUSY: resource busy or locked, rmdir 'C:\Users\RUNNER~1\AppData\Local\Temp\comprehend-smoke-b9n120'
 ❯ tests/comprehension/comprehend-smoke.e2e.test.ts:60:15
Serialized Error: { errno: -4082, code: 'EBUSY', syscall: 'rmdir', path: '...' }

Test Files  1 failed | 733 passed | 5 skipped
```

Zero failed tests. The `syscall` is `rmdir` — the only thing that failed was
deleting a temp directory, so the run reported the product as broken when
nothing about the product misbehaved.

The block scaffolds a scratch repo with four `spawnSync('git', ...)` calls and
then drives the real `harness comprehend` binary through eight more
`spawnSync`s, all with `cwd: proj`. `spawnSync` returns when the child _exits_,
but Windows releases that child's open file handles asynchronously afterwards
and refuses to unlink a file while a handle to it is open — so the teardown can
begin removing `proj` while handles under it are still live.

The teardown already passed `force: true`, which reads like error tolerance but
is not: Node documents `force` as ignoring exceptions **if `path` does not
exist**. It suppresses `ENOENT` only and does nothing for a locked path, so the
teardown had no tolerance at all.

The removal now awaits the settle:

```ts
if (proj) rmSync(proj, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
```

`maxRetries`/`retryDelay` make Node retry on exactly the `EBUSY`/`ENOTEMPTY`/
`EPERM` class in play until the OS releases the handles. The values mirror the
existing in-repo precedent at `packages/core/tests/state/gate.test.ts:21`.

The nondeterminism is removed rather than hidden: no `skipIf(win32)`, no
swallowing `try`/`catch`, no job-level retry, and no assertion changed. The
retry costs only the actual settle time, and is a no-op on POSIX, where handles
are released synchronously on exit.

Test-only change; no product code, no public API, and no runtime behaviour is
affected.

Refs #2089 — the issue's structural half (a shared `removeTempDirSafely` helper
and the migration of the four ad-hoc sites onto it) is deliberately not
addressed here and remains open.

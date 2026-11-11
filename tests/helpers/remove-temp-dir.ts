// tests/helpers/remove-temp-dir.ts
//
// Shared teardown helper for tests that create a scratch directory under
// os.tmpdir(). Imported by package test suites (core, cli, orchestrator) via a
// relative path, the same way package vitest configs reach into repo-root
// scripts/. It is test-only code and is never bundled into a published package.

import fs from 'node:fs';

/**
 * Retry budget handed to `fs.rmSync`. Node retries on exactly the
 * EBUSY / EMFILE / ENFILE / ENOTEMPTY / EPERM class, with a linear backoff of
 * `retryDelay` ms more on each attempt (100 + 200 + ... + 1000 = ~5.5s worst
 * case before it gives up). Values match the first in-repo precedent,
 * packages/core/tests/state/gate.test.ts.
 */
export const REMOVE_TEMP_DIR_OPTIONS = {
  recursive: true,
  force: true,
  maxRetries: 10,
  retryDelay: 100,
} as const satisfies fs.RmOptions;

/**
 * Recursively remove a temp directory, tolerating a transient Windows file lock.
 *
 * Windows: a just-exited child process (`git`, `npm`, the `harness` CLI, a git
 * worktree) can briefly retain handles on files under the directory, and
 * Windows refuses to unlink a file while a handle to it is open. A plain
 * recursive `rmSync` therefore intermittently throws EBUSY / ENOTEMPTY / EPERM
 * and reds a suite from its teardown after every assertion has passed (#2089).
 * `force` does NOT cover this: it suppresses "path does not exist", not "path is
 * locked". `maxRetries`/`retryDelay` makes Node retry until the OS releases the
 * handles ("await the settle"), removing the teardown-race nondeterminism rather
 * than hiding it. A no-op on POSIX, where handles are released synchronously on
 * exit.
 *
 * Deliberately NOT wrapped in a swallowing try/catch: if the retry budget is
 * exhausted the lock is not transient, and that is a real fault that must stay
 * loud. A falsy `dir` (setup never ran) is a no-op.
 */
export function removeTempDirSafely(dir: string | undefined | null): void {
  if (!dir) return;
  fs.rmSync(dir, REMOVE_TEMP_DIR_OPTIONS);
}

/**
 * Run-boundary reentrancy guard for the comprehension driver.
 *
 * Pure env logic (no IO, no LLM) — promoted into core so the {@link runComprehend}
 * driver can depend on it without pulling in the cli-side semantic/LLM adapter.
 * The cli `generate-semantic` module re-exports these for back-compat.
 */

/** The env flag marking a comprehension run active for its whole duration. */
export const REENTRANCY_ENV = 'HARNESS_COMPREHENSION_ACTIVE';

/**
 * RUN-boundary reentrancy check. `true` when {@link REENTRANCY_ENV} is already set
 * on entry — i.e. this process was spawned (inheriting env) by an in-flight
 * comprehension run (the nested `claude --print` recursion vector). The driver
 * calls this ONCE at the start of a run and refuses to comprehend when it is
 * true. It is NOT consulted per-module, so legitimate in-process concurrent
 * siblings are never blocked.
 */
export function isComprehensionReentrant(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env[REENTRANCY_ENV]);
}

/**
 * Mark a whole comprehension run active for its entire duration. Sets
 * {@link REENTRANCY_ENV} before `fn`, restores the previous value in `finally`
 * (deleting it when it was previously unset), so any nested `claude` child spawned
 * by ANY module's analyze inherits the flag and, on its own entry,
 * {@link isComprehensionReentrant} returns true — the cross-process recursion
 * guard — while in-process concurrent siblings within this run all proceed.
 */
export async function withComprehensionActive<T>(
  fn: () => Promise<T>,
  env: NodeJS.ProcessEnv = process.env
): Promise<T> {
  const prev = env[REENTRANCY_ENV];
  env[REENTRANCY_ENV] = '1';
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete env[REENTRANCY_ENV];
    else env[REENTRANCY_ENV] = prev;
  }
}

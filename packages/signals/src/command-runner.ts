import { execFile } from 'node:child_process';

/**
 * Injectable runner for shelling out to git/gh. Returns trimmed stdout; rejects
 * on non-zero exit, spawn error, or budget exhaustion. Mirrors the execFile
 * pattern in `server/identity.ts`. Providers depend on this type so tests can
 * pass a mock runner instead of touching the real git/gh binaries or the network.
 *
 * `timeoutMs` is part of the type — not just of the default implementation —
 * because the budget is a property of the CALL, not of the runner: a local
 * `git log` and a paginated `gh pr list` over the network do not belong on the
 * same clock, and a consumer typed as `CommandRunner` must be able to say which
 * one it is making. A mock that ignores the argument stays assignable.
 */
export type CommandRunner = (cmd: string, args: string[], timeoutMs?: number) => Promise<string>;

/** Default per-command timeout (ms) for {@link defaultCommandRunner}. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 5_000;

/**
 * Budget (ms) for a command that makes a network round-trip — in practice `gh`.
 *
 * {@link DEFAULT_COMMAND_TIMEOUT_MS} is a LOCAL-process budget: ample for a
 * `git log`, and far too tight for `gh pr list --limit 500 --json ...,reviews`,
 * which pages the GitHub API and measured ~10-14s against a real repository.
 * Under the 5s budget that call was SIGTERM-killed every time, and the kill
 * surfaced as Node's bare `Command failed: <argv>` with an empty stderr tail —
 * which the signal providers then reported as "gh unavailable or not
 * authenticated", sending the reader after an auth problem that did not exist.
 *
 * 30s leaves headroom for a slow link or a busy API without tolerating a genuine
 * hang, which still hits the ceiling.
 */
export const NETWORK_COMMAND_TIMEOUT_MS = 30_000;

/**
 * Default `execFile`-based runner.
 *
 * `timeoutMs` defaults to {@link DEFAULT_COMMAND_TIMEOUT_MS} (5s) — the budget
 * local git calls run under in production. Callers making a network call should
 * pass {@link NETWORK_COMMAND_TIMEOUT_MS}; a caller on a heavily-loaded host
 * (e.g. a full-suite parallel test run where many workers each spawn a fresh
 * subprocess) can widen it further, since under saturation even a bare `node -e`
 * launch can exceed 5s and the fixed budget would kill an otherwise-healthy
 * child. A larger budget only tolerates a slow/loaded host — a genuine hang
 * still hits the ceiling — so it cannot mask a real defect.
 *
 * A budget kill rejects with a message that names the timeout, so callers can
 * tell "too slow" from "broken or unauthenticated" instead of collapsing both
 * into one misleading diagnosis.
 */
export const defaultCommandRunner: CommandRunner = (
  cmd,
  args,
  timeoutMs: number = DEFAULT_COMMAND_TIMEOUT_MS
) =>
  new Promise<string>((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        const e = err as NodeJS.ErrnoException & { killed?: boolean };
        if (e.killed === true || e.code === 'ETIMEDOUT') {
          reject(new Error(`Command \`${cmd} ${args.join(' ')}\` timed out after ${timeoutMs}ms`));
          return;
        }
        reject(err as Error);
        return;
      }
      resolve(stdout.trim());
    });
  });

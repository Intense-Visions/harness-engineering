import { execFile } from 'node:child_process';

/**
 * Injectable runner for shelling out to git/gh. Returns trimmed stdout; rejects
 * on non-zero exit or spawn error. Mirrors the execFile pattern in
 * `server/identity.ts`. Providers depend on this type so tests can pass a mock
 * runner instead of touching the real git/gh binaries or the network.
 */
export type CommandRunner = (cmd: string, args: string[]) => Promise<string>;

/** Default per-command timeout (ms) for {@link defaultCommandRunner}. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 5_000;

/**
 * Default `execFile`-based runner.
 *
 * `timeoutMs` defaults to {@link DEFAULT_COMMAND_TIMEOUT_MS} (5s) — the budget
 * real git/gh calls run under in production. It is an optional escape hatch so a
 * caller on a heavily-loaded host (e.g. a full-suite parallel test run where many
 * workers each spawn a fresh subprocess) can widen it: under saturation even a
 * bare `node -e` launch can exceed 5s, so the fixed budget would kill an
 * otherwise-healthy child and surface a spurious failure. A larger budget only
 * tolerates a slow/loaded host — a genuine hang still hits the ceiling — so it
 * cannot mask a real defect. Direct callers may pass a wider value; callers that
 * consume the `CommandRunner` type keep the 5s default.
 */
export const defaultCommandRunner: CommandRunner = (
  cmd,
  args,
  timeoutMs: number = DEFAULT_COMMAND_TIMEOUT_MS
) =>
  new Promise<string>((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        reject(err as Error);
        return;
      }
      resolve(stdout.trim());
    });
  });

import { execFile } from 'node:child_process';

/**
 * Injectable runner for shelling out to git/gh. Returns trimmed stdout; rejects
 * on non-zero exit or spawn error. Mirrors the execFile pattern in
 * `server/identity.ts`. Providers depend on this type so tests can pass a mock
 * runner instead of touching the real git/gh binaries or the network.
 */
export type CommandRunner = (cmd: string, args: string[]) => Promise<string>;

/** Default `execFile`-based runner with a 5s timeout. */
export const defaultCommandRunner: CommandRunner = (cmd, args) =>
  new Promise<string>((resolve, reject) => {
    execFile(cmd, args, { timeout: 5_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        reject(err as Error);
        return;
      }
      resolve(stdout.trim());
    });
  });

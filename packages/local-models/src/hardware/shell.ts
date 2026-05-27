/**
 * `ShellRunner` — the dependency-injection seam for hardware-detection probes.
 *
 * Platform detectors take a `ShellRunner` instead of importing `child_process`
 * directly so unit tests can drop in deterministic stubs (no real
 * `system_profiler` or `nvidia-smi` invocations on CI). The default
 * implementation uses `child_process.execFile` with a short timeout and
 * `windowsHide: true` so the user never sees a console flash on Windows.
 *
 * The runner intentionally exposes both `code` and `stderr` so detectors can
 * distinguish "binary not installed" (`ENOENT`) from "binary exists but
 * misbehaved" (non-zero exit with stderr). Only the latter is worth a warning;
 * the former is the normal CPU-fallback path.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

/** Result of a single shell invocation. */
export interface ShellResult {
  stdout: string;
  stderr: string;
  /** Exit code (`0` on success). Always `0` when the promise resolves. */
  code: number;
}

/**
 * Pluggable shell runner. Tests inject a stub; production uses the
 * `defaultShellRunner` below.
 */
export interface ShellRunner {
  run(cmd: string, args: readonly string[]): Promise<ShellResult>;
}

/**
 * Default 5-second timeout for hardware probes. `sysctl` and `nvidia-smi`
 * return in well under 100 ms in steady state — 5 s is a defensive ceiling
 * that still keeps `harness models status` snappy (F1 requires < 2 s end-to-end).
 */
const DEFAULT_TIMEOUT_MS = 5_000;

/** Production `ShellRunner` backed by `child_process.execFile`. */
export const defaultShellRunner: ShellRunner = {
  async run(cmd, args) {
    const { stdout, stderr } = await execFileP(cmd, [...args], {
      timeout: DEFAULT_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { stdout, stderr, code: 0 };
  },
};

// Shared E2E helper: drive the REAL built `harness` binary as a subprocess.
//
// Part of the tiered E2E framework (ADR 0111). Extracted from the inline logic
// that comprehend-smoke.e2e.test.ts discovered, so new E2E tests are cheap to
// add and every one spawns the CLI the same win32-safe way.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * The built CLI entrypoint. `turbo run build` produces it before the test task;
 * when absent (someone ran a test without building), E2E suites `skipIf(!HAS_HARNESS_BIN)`
 * rather than fail — they are smoke tests over the built artifact, not the source.
 *
 * `process.cwd()` is the package root under the per-package vitest run, so the
 * package's own `dist/bin/harness.js` is the natural resolution. Callers in other
 * packages pass an explicit `bin` to {@link runHarness} if theirs differs.
 */
export const HARNESS_BIN = path.resolve(process.cwd(), 'dist/bin/harness.js');

/** Whether the built binary exists — the guard every Tier A/C suite gates on. */
export const HAS_HARNESS_BIN = existsSync(HARNESS_BIN);

export interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  /** Working directory for the spawned CLI (usually a scaffolded temp project). */
  cwd: string;
  /**
   * Environment for the child. When omitted the parent env is inherited. Either way
   * `HARNESS_NO_UPDATE_CHECK=1` is defaulted in unless the caller sets it (#2652).
   */
  env?: NodeJS.ProcessEnv;
  /** Override the binary path (for callers outside the cli package). */
  bin?: string;
  /**
   * Per-call timeout in ms. Default {@link DEFAULT_HARNESS_TIMEOUT_MS} (E2E spawns are
   * slow under CI load). Exceeding it throws — see {@link runHarness}.
   */
  timeoutMs?: number;
}

/** Default per-call bound. Generous: cold starts take tens of seconds under the pre-push gate's load. */
export const DEFAULT_HARNESS_TIMEOUT_MS = 60_000;

/** Last `max` characters of captured output, for a diagnosable failure message. */
function tail(text: string | null | undefined, max = 2_000): string {
  const s = text ?? '';
  return s.length > max ? `...${s.slice(-max)}` : s;
}

/**
 * Spawn `harness <args>` as a real subprocess and return its exit status + IO.
 *
 * Uses `process.execPath` + the built `.js` entry — NEVER the `node_modules/.bin`
 * shim, which ENOENTs when spawned directly on win32 (see the CLI's own notes).
 *
 * The timeout is the ONLY thing that bounds this call: `spawnSync` blocks the
 * vitest worker's event loop, so the package `testTimeout` cannot fire while a
 * child hangs (#2555 — one hung `validate --json` stalled the pre-push gate for
 * 15 minutes). On timeout, a kill signal, or a spawn failure this THROWS with
 * the command, cwd, and output captured so far, rather than returning a status:
 * a child that exited 0 while a grandchild kept its output pipes open comes back
 * from `spawnSync` as `status: 0` + `error: ETIMEDOUT`, so a status-only check
 * would pass a run that never finished.
 */
export function runHarness(args: string[], opts: RunOptions): RunResult {
  const bin = opts.bin ?? HARNESS_BIN;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_HARNESS_TIMEOUT_MS;
  const res = spawnSync(process.execPath, [bin, ...args], {
    cwd: opts.cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    // The CLI fires detached background update/freshness probes at startup.
    // No E2E is about them, and a probe that outlives the CLI must never be
    // able to hold the scratch project open on Windows and red a teardown
    // with EBUSY (#2652). A caller that does want them can pass '0'.
    env: { HARNESS_NO_UPDATE_CHECK: '1', ...(opts.env ?? process.env) },
  });
  if (res.error || res.signal) {
    const command = `harness ${args.join(' ')}`;
    const timedOut = (res.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT';
    const reason = timedOut
      ? `did not finish within ${timeoutMs}ms`
      : res.error
        ? `failed to run: ${res.error.message}`
        : `was killed by ${res.signal}`;
    throw new Error(
      [
        `${command} ${reason} (cwd: ${opts.cwd}, bin: ${bin}, exit status: ${res.status ?? 'none'}, signal: ${res.signal ?? 'none'}).`,
        `--- stdout (tail) ---\n${tail(res.stdout)}`,
        `--- stderr (tail) ---\n${tail(res.stderr)}`,
      ].join('\n')
    );
  }
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

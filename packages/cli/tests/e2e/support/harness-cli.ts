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
  /** Environment for the child. When omitted the parent env is inherited. */
  env?: NodeJS.ProcessEnv;
  /** Override the binary path (for callers outside the cli package). */
  bin?: string;
  /** Per-call timeout in ms. Default 60s (E2E spawns are slow under CI load). */
  timeoutMs?: number;
}

/**
 * Spawn `harness <args>` as a real subprocess and return its exit status + IO.
 *
 * Uses `process.execPath` + the built `.js` entry — NEVER the `node_modules/.bin`
 * shim, which ENOENTs when spawned directly on win32 (see the CLI's own notes).
 */
export function runHarness(args: string[], opts: RunOptions): RunResult {
  const bin = opts.bin ?? HARNESS_BIN;
  const res = spawnSync(process.execPath, [bin, ...args], {
    cwd: opts.cwd,
    encoding: 'utf8',
    timeout: opts.timeoutMs ?? 60_000,
    ...(opts.env ? { env: opts.env } : {}),
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

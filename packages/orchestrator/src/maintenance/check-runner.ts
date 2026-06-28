// packages/orchestrator/src/maintenance/check-runner.ts
//
// Shared spawn+parse+timeout core for maintenance `checkCommand` execution.
// Both maintenance check runners — the cron orchestrator
// (Orchestrator.createMaintenanceTaskRunner) and the on-demand CLI
// (`harness maintenance run` → createCheckRunner) — own only a thin
// command-resolution shim and delegate the actual spawn / output-parse /
// timeout / executionFailed classification to `runHarnessCheck` here, so cron
// and CLI behave IDENTICALLY (ADR 0050 — execution honesty).

import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CheckCommandResult } from './task-runner';

/**
 * Generous stdout/stderr capture ceiling for spawned maintenance checks. The
 * Node `execFile` default (1 MB) is far too small for verbose checks — e.g.
 * `harness cleanup` on a large repo emits ~8 MB — and an exceeded buffer
 * rejects with EMPTY stdout/stderr, which the runner would misread as a check
 * that produced no output (a false execution failure). 64 MB leaves ample
 * headroom while still bounding memory.
 */
export const MAINTENANCE_CHECK_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Per-check wall-clock budget. Raised from the original 120 s because heavy
 * whole-repo checks legitimately need longer on large monorepos — `harness
 * cleanup` (all entropy types) takes ~165 s here — and a too-tight timeout
 * SIGTERMs the child, yielding empty output that the runner can only read as a
 * (false) execution failure. 300 s keeps a bound while letting real checks
 * finish.
 */
export const MAINTENANCE_CHECK_TIMEOUT_MS = 300_000;

/** Primary findings-count parser ("45 issues", "3 findings", …). */
const FINDINGS_RE = /(\d+)\s+(?:finding|issue|violation|error)/i;

const nodeExecFileAsync = promisify(nodeExecFile);

/** A resolved child-process invocation: the file to spawn and its argv. The two
 * callers build this differently (CLI: `process.execPath` + the CLI's own entry
 * script; cron: the `harness` binary on PATH) but the spawn/parse core is one. */
export interface HarnessSpawn {
  file: string;
  args: string[];
}

/** The shape of an `execFile` rejection the timeout/classification logic reads. */
export interface ExecFileError {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  killed?: boolean;
  signal?: string | null;
  code?: string | number | null;
}

/** Injectable `execFile` (promisified) so tests can drive the spawn-error,
 * clean-run, findings, and timeout branches without real subprocesses. */
export type ExecFileAsyncFn = (
  file: string,
  args: string[],
  options: { cwd: string; timeout: number; maxBuffer: number }
) => Promise<{ stdout: string | Buffer; stderr?: string | Buffer }>;

export interface RunHarnessCheckOptions {
  /** Injected for tests; defaults to the real promisified `execFile`. */
  execFileAsync?: ExecFileAsyncFn;
  /** Per-check wall-clock budget (default {@link MAINTENANCE_CHECK_TIMEOUT_MS}). */
  timeoutMs?: number;
  /** stdout/stderr capture ceiling (default {@link MAINTENANCE_CHECK_MAX_BUFFER}). */
  maxBuffer?: number;
}

/** Best-effort detection of a child killed by the `execFile` timeout (SIGTERM /
 * ETIMEDOUT / killed flag). */
export function isCheckTimeoutError(e: ExecFileError): boolean {
  return e.killed === true || e.signal === 'SIGTERM' || e.code === 'ETIMEDOUT';
}

/**
 * Spawn a resolved harness check invocation and classify its result into a
 * {@link CheckCommandResult}. Behavior (shared by cron + CLI):
 *
 *   - clean exit, parseable count → `{ findings: N }` (or 0 on a parse-miss; a
 *     check that ran and said nothing is clean, not "1 finding").
 *   - non-zero exit WITH a parseable count → real findings (`executionFailed:
 *     false`) — e.g. `check-arch` exits 1 with "45 issues".
 *   - non-zero exit / spawn error with NO parseable count → `executionFailed:
 *     true`, findings 0 (a broken check is not "1 finding"; ADR 0050).
 *   - TIMEOUT (SIGTERM/ETIMEDOUT) → `executionFailed: true`, findings 0, with a
 *     distinct "check timed out after Nms" marker APPENDED to whatever the child
 *     flushed. A timed-out check did not complete: even partial parseable output
 *     ("5 issues") it flushed before SIGTERM is truncated and untrustworthy, so
 *     the timeout is classified ahead of any finding count — never a "ran-no-
 *     count" success. {@link import('./task-runner').classifyCheckExecutionFailure}
 *     matches this marker before `explicitFindingsCount`.
 */
export async function runHarnessCheck(
  spawn: HarnessSpawn,
  cwd: string,
  opts: RunHarnessCheckOptions = {}
): Promise<CheckCommandResult> {
  const execFileAsync = opts.execFileAsync ?? (nodeExecFileAsync as ExecFileAsyncFn);
  const timeoutMs = opts.timeoutMs ?? MAINTENANCE_CHECK_TIMEOUT_MS;
  const maxBuffer = opts.maxBuffer ?? MAINTENANCE_CHECK_MAX_BUFFER;

  try {
    const { stdout } = await execFileAsync(spawn.file, spawn.args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer,
    });
    const text = String(stdout);
    const m = text.match(FINDINGS_RE);
    const findings = m ? parseInt(m[1]!, 10) : 0;
    return { passed: findings === 0, findings, output: text, executionFailed: false };
  } catch (err) {
    const e = err as ExecFileError;
    let output = [e.stdout, e.stderr]
      .map((v) => (v == null ? '' : String(v)))
      .filter(Boolean)
      .join('\n');

    // Timeout provenance: a SIGTERM'd check did not complete. Annotate the
    // output with a distinct, controlled marker — even when the child flushed
    // PARTIAL parseable output before dying — and flag executionFailed so the
    // TaskRunner classifies it `unrunnable` (failure), never a truncated
    // "ran-no-count" success.
    if (isCheckTimeoutError(e)) {
      const note = `check timed out after ${timeoutMs}ms`;
      output = output.trim() ? `${output}\n${note}` : note;
      return { passed: false, findings: 0, output, executionFailed: true };
    }

    const m = output.match(FINDINGS_RE);
    if (m) {
      // Non-zero exit WITH a parseable count: the check ran and found issues.
      return { passed: false, findings: parseInt(m[1]!, 10), output, executionFailed: false };
    }
    // Non-zero exit / spawn error with NO parseable count: could not produce a
    // usable result (ENOENT, unknown subcommand, crash). Flag executionFailed.
    return { passed: false, findings: 0, output, executionFailed: true };
  }
}

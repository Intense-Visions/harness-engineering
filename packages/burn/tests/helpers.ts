import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { resolvePaths, type BurnPaths } from '../src/config';

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BIN = path.join(PACKAGE_ROOT, 'dist', 'bin', 'burn-hud.mjs');

/**
 * Run the built binary with stdin closed immediately.
 *
 * The binary reads stdin to completion (Claude Code pipes a JSON payload in),
 * so a caller that leaves the pipe open hangs it — `execFile` does exactly
 * that, which is how a 30s test timeout surfaced the footgun.
 */
export function runBin(
  args: string[],
  env: NodeJS.ProcessEnv,
  stdin = '{}'
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return runProcess(process.execPath, [BIN, ...args], env, stdin);
}

/** Spawn `command`, write `stdin` and close it, and settle on the child's `'close'`. */
export function runProcess(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  stdin: string
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code }));
    guardChildStdin(child.stdin, reject);
    child.stdin.end(stdin);
  });
}

/**
 * Errors a stdin write gets when the child has already closed its end of the
 * pipe: EPIPE (POSIX), ECONNRESET / EOF (win32 named pipes), or a write landing
 * after Node destroyed the stream. None of them carries a result of its own —
 * the child's exit status does. Mirrors the predicate in
 * `packages/orchestrator/src/agent/backends/child-stdin.ts` (#2298).
 */
export function isClosedPipeError(e: NodeJS.ErrnoException): boolean {
  return (
    e.code === 'EPIPE' ||
    e.code === 'ECONNRESET' ||
    e.code === 'EOF' ||
    e.code === 'ERR_STREAM_DESTROYED'
  );
}

/**
 * Attach the `'error'` listener a child's stdin MUST have before it is written.
 *
 * `scan` and the usage fallback never read stdin, so the child can exit before
 * the write flushes; the write then fails with a closed-pipe error, and with no
 * listener that error is an uncaught exception that reds an all-pass run
 * (#2356). A closed pipe is ignored because `'close'` decides the outcome; any
 * other stdin error means the child never got its input, so it is forwarded.
 */
export function guardChildStdin(stdin: Writable, onOtherError: (e: Error) => void): void {
  stdin.on('error', (e: NodeJS.ErrnoException) => {
    if (isClosedPipeError(e)) return;
    onOtherError(e);
  });
}

/** An isolated HUD tree, driven through the same env vars a real install uses. */
export interface Hud {
  root: string;
  paths: BurnPaths;
  env: NodeJS.ProcessEnv;
  writeConfig(cfg: Record<string, unknown>): void;
  writeTranscript(name: string, lines: string[]): void;
  /** Write a transcript under `<session>/subagents/`, where Claude Code puts dispatched agents. */
  writeSubagentTranscript(name: string, lines: string[]): void;
  cleanup(): void;
}

export function makeHud(): Hud {
  const root = mkdtempSync(path.join(tmpdir(), 'burn-hud-'));
  const home = path.join(root, 'hud');
  const state = path.join(home, 'state');
  const projects = path.join(root, 'projects');
  const projectDir = path.join(projects, '-proj');
  mkdirSync(state, { recursive: true });
  mkdirSync(projectDir, { recursive: true });

  const env = {
    ...process.env,
    CLAUDE_HUD_HOME: home,
    CLAUDE_HUD_STATE: state,
    CLAUDE_HUD_PROJECTS: projects,
  };

  return {
    root,
    paths: resolvePaths(env),
    env,
    writeConfig(cfg) {
      writeFileSync(path.join(home, 'config.json'), JSON.stringify(cfg));
    },
    writeTranscript(name, lines) {
      writeFileSync(path.join(projectDir, name), lines.join('\n') + '\n');
    },
    writeSubagentTranscript(name, lines) {
      const dir = path.join(projectDir, 'session', 'subagents');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, name), `${lines.join('\n')}\n`);
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** A Monday-UTC week, matching the Python suite's default fixture config. */
export const DEFAULT_WEEK = { weekday: 0, time: '00:00', tz: 'UTC' };

/**
 * A fixed instant clear of every week boundary the suite configures:
 * Wednesday 12:00 UTC, 2.5 days past a DEFAULT_WEEK reset and 12h past a UTC
 * midnight.
 *
 * Any test that writes fixture rows relative to "now" and then asserts on the
 * week-to-date rollup must pin both to this instant and pass it to
 * `refresh`/`recompute` — never `new Date()`. Against the wall clock a row
 * written at `hoursAgo(now, 1)` lands in the PREVIOUS week for the first hour
 * after every Monday 00:00 UTC reset, so the suite failed on every OS inside
 * that window and passed on any re-run outside it (#1966). The summary takes
 * `now` as a parameter precisely so the suite can do this; fake timers are not
 * used because `refreshIfStale` compares against real file mtimes.
 */
export const MID_WEEK = new Date('2026-08-12T12:00:00Z');

export function transcriptLine(
  requestId: string,
  when: Date,
  opts: { model?: string; out?: number; in?: number; cw?: number; cr?: number } = {}
): string {
  return JSON.stringify({
    requestId,
    timestamp: when.toISOString(),
    type: 'assistant',
    message: {
      id: `msg_${requestId}`,
      model: opts.model ?? 'claude-opus-5',
      usage: {
        output_tokens: opts.out ?? 100,
        input_tokens: opts.in ?? 10,
        cache_creation_input_tokens: opts.cw ?? 0,
        cache_read_input_tokens: opts.cr ?? 0,
      },
    },
  });
}

export function hoursAgo(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * 3_600_000);
}

export function minutesAgo(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

export function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

/** 0=Mon..6=Sun for a Date, in UTC — the weekday convention the config uses. */
export function utcIsoWeekday(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

/**
 * A transcript line carrying Claude Code's identity fields.
 *
 * `fields` is applied verbatim so a test can omit one signal and assert the
 * other still classifies — that independence is the whole point of the
 * two-signal shape assertion.
 */
export function agentLine(
  requestId: string,
  when: Date,
  fields: {
    isSidechain?: boolean;
    agentId?: string;
    attributionAgent?: string;
    attributionSkill?: string;
  },
  opts: { model?: string; out?: number; in?: number; cw?: number; cr?: number } = {}
): string {
  const base = JSON.parse(transcriptLine(requestId, when, opts)) as Record<string, unknown>;
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) base[k] = v;
  }
  return JSON.stringify(base);
}

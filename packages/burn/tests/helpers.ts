import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code }));
    child.stdin.end(stdin);
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
  fields: { isSidechain?: boolean; agentId?: string; attributionAgent?: string },
  opts: { model?: string; out?: number; in?: number; cw?: number; cr?: number } = {}
): string {
  const base = JSON.parse(transcriptLine(requestId, when, opts)) as Record<string, unknown>;
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) base[k] = v;
  }
  return JSON.stringify(base);
}

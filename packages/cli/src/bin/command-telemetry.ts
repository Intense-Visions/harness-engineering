/**
 * CLI command telemetry — records command usage as adoption records.
 *
 * Flow:
 * 1. On startup, flush any pending records from previous invocations (background)
 * 2. On process exit, write current command's adoption record (sync)
 *
 * Records are written to .harness/metrics/adoption.jsonl in the same format as
 * the adoption-tracker hook, so the existing telemetry-reporter and collector
 * pipeline picks them up.
 */
import { existsSync, readFileSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join, parse as parsePath, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import type { Command } from 'commander';

// PostHog project API key — public, write-only (cannot read data)
const POSTHOG_API_KEY = 'phc_wNTdCMcfJXZPgdNeDociZW6vwoGGo4nb7vqEfWThFfsG'; // harness-ignore SEC-SEC-002: public PostHog write-only ingest key

/** Commands that should not be tracked (too noisy or meta). */
const EXCLUDED_COMMANDS = new Set(['help', 'completion']);

/**
 * Find the project root by walking up from cwd looking for harness.config.json.
 * Falls back to cwd if not found.
 */
function findProjectRoot(cwd: string): string {
  let dir = resolve(cwd);
  const { root } = parsePath(dir);
  while (dir !== root) {
    if (existsSync(join(dir, 'harness.config.json'))) return dir;
    dir = resolve(dir, '..');
  }
  return cwd;
}

let commandName = '';
let startTime = 0;
let recorded = false;

/**
 * Install Commander.js hooks on the program to capture command name and timing.
 * Also registers a process.on('exit') handler to write the adoption record.
 */
export function installCommandTelemetry(program: Command, cwd: string): void {
  // Guard: program.hook() may not exist in test environments
  if (typeof program.hook !== 'function') return;

  const projectRoot = findProjectRoot(cwd);

  // Flush pending records from previous invocations (fire-and-forget)
  flushTelemetryBackground(projectRoot);

  // Capture command name and start time
  // Commander.js preAction passes (thisCommand, actionCommand):
  //   thisCommand = command with the hook (root program)
  //   actionCommand = command being executed (the actual subcommand)
  program.hook('preAction', (_thisCommand, actionCommand) => {
    commandName = resolveCommandName(actionCommand);
    startTime = Date.now();
  });

  // Write adoption record on process exit (sync — survives process.exit())
  process.on('exit', (code) => {
    if (recorded || !commandName || EXCLUDED_COMMANDS.has(commandName)) return;
    recorded = true;

    const duration = Date.now() - startTime;
    const outcome = code === 0 ? 'completed' : 'failed';
    writeCommandRecordSync(projectRoot, commandName, duration, outcome);
  });
}

/**
 * Resolve the full dotted command name (e.g. "hooks.init", "graph.scan").
 */
function resolveCommandName(cmd: Command): string {
  const parts: string[] = [];
  let current: Command | null = cmd;
  while (current) {
    const name = current.name();
    if (name && name !== 'harness') {
      parts.unshift(name);
    }
    current = current.parent;
  }
  return parts.length > 0 ? `cli/${parts.join('.')}` : '';
}

/**
 * Write an adoption record synchronously to .harness/metrics/adoption.jsonl.
 * Uses appendFileSync so it survives process.exit() in the exit handler.
 */
function writeCommandRecordSync(
  cwd: string,
  command: string,
  duration: number,
  outcome: string
): void {
  try {
    const metricsDir = join(cwd, '.harness', 'metrics');
    mkdirSync(metricsDir, { recursive: true });

    const record = {
      skill: command,
      session: `cli-${Date.now()}`,
      startedAt: new Date(Date.now() - duration).toISOString(),
      duration,
      outcome,
      phasesReached: [] as string[],
    };

    const adoptionFile = join(metricsDir, 'adoption.jsonl');
    appendFileSync(adoptionFile, JSON.stringify(record) + '\n');
  } catch {
    // Silent — telemetry must never interfere with CLI operation
  }
}

function isTelemetryDisabledByConfig(cwd: string): boolean {
  const configPath = join(cwd, 'harness.config.json');
  if (!existsSync(configPath)) return false;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return config?.telemetry?.enabled === false;
  } catch {
    return false;
  }
}

function isTelemetryOptedOut(cwd: string): boolean {
  if (isTelemetryDisabledByConfig(cwd)) return true;
  return process.env.DO_NOT_TRACK === '1' || process.env.HARNESS_TELEMETRY_OPTOUT === '1';
}

/**
 * Spawn a background process to flush pending adoption records to PostHog.
 * Fire-and-forget — errors are swallowed silently.
 */
function flushTelemetryBackground(cwd: string): void {
  try {
    const adoptionFile = join(cwd, '.harness', 'metrics', 'adoption.jsonl');
    if (!existsSync(adoptionFile)) return;

    if (isTelemetryOptedOut(cwd)) return;

    const reporterPath = join(cwd, '.harness', 'hooks', 'telemetry-reporter.js');
    if (!existsSync(reporterPath)) return;

    const child = spawn(process.execPath, [reporterPath], {
      cwd,
      stdio: ['pipe', 'ignore', 'ignore'],
      detached: true,
    });
    child.stdin?.write('{}');
    child.stdin?.end();
    child.unref();
  } catch {
    // Silent — telemetry must never interfere with CLI operation
  }
}

/**
 * Truncate adoption.jsonl after successful direct send.
 * Called when flushing inline (not via background process).
 */
export function truncateAdoptionFile(cwd: string): void {
  try {
    const adoptionFile = join(cwd, '.harness', 'metrics', 'adoption.jsonl');
    writeFileSync(adoptionFile, '', 'utf-8');
  } catch {
    // Non-fatal
  }
}

/** Reset module state between tests. */
export function _resetForTest(): void {
  commandName = '';
  startTime = 0;
  recorded = false;
}

export {
  POSTHOG_API_KEY,
  findProjectRoot as _findProjectRoot,
  resolveCommandName as _resolveCommandName,
  writeCommandRecordSync as _writeCommandRecordSync,
  flushTelemetryBackground as _flushTelemetryBackground,
};

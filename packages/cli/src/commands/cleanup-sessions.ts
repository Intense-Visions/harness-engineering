// packages/cli/src/commands/cleanup-sessions.ts
//
// Hermes Phase 2 — Extended to general `.harness/` disk hygiene while
// preserving backwards-compat with the original sessions-only behavior:
// `harness cleanup-sessions` (no flags) continues to sweep `.harness/sessions/`
// at the 24h TTL; new `--all`, `--include`, `--exclude` flags select among
// registered targets (cache, maintenance outputs, dashboard state, etc.).
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err, AUTO_DECISIONS_FILE } from '@harness-engineering/core';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';
import { resolveConfig } from '../config/loader';

const STALE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Hermes Phase 2 — Registered cleanup targets under `.harness/`.
 *
 * Default TTLs match the proposal §D7 table. Operators override per-target
 * TTLs via `cleanup.ttlHours: { <name>: <hours> }` in `harness.config.json`;
 * unknown keys are ignored.
 */
export interface CleanupTarget {
  name: string;
  /** Path relative to `.harness/`. */
  relativeDir: string;
  defaultTtlMs: number;
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export const CLEANUP_TARGETS: readonly CleanupTarget[] = [
  { name: 'sessions', relativeDir: 'sessions', defaultTtlMs: 24 * ONE_HOUR_MS },
  { name: 'cache', relativeDir: 'cache', defaultTtlMs: 7 * ONE_DAY_MS },
  { name: 'maintenance', relativeDir: 'maintenance', defaultTtlMs: 30 * ONE_DAY_MS },
  { name: 'dashboard-state', relativeDir: 'dashboard-state', defaultTtlMs: 14 * ONE_DAY_MS },
  { name: 'snapshots', relativeDir: 'snapshots', defaultTtlMs: 14 * ONE_DAY_MS },
  { name: 'analyzer-output', relativeDir: 'analyzer-output', defaultTtlMs: 7 * ONE_DAY_MS },
];

interface CleanupSessionsOptions {
  cwd?: string;
  dryRun?: boolean;
}

export interface CleanupSessionsResult {
  removed: string[];
  kept: string[];
  /** Stale sessions kept only because they hold a non-empty auto-decision log (review N4); a subset of kept. */
  retained: string[];
}

function getMostRecentMtime(dirPath: string): number {
  let latest = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const stat = fs.statSync(fullPath);
      if (stat.mtimeMs > latest) latest = stat.mtimeMs;
    }
    // Also check the directory itself
    const dirStat = fs.statSync(dirPath);
    if (dirStat.mtimeMs > latest) latest = dirStat.mtimeMs;
  } catch {
    // If we can't stat, treat as old
  }
  return latest;
}

/**
 * A session whose auto-decision log is non-empty is never TTL-swept (review I2): the log is the
 * audit trail of decisions an agent took on its own, and must outlive the session's working
 * files. Archive it (or delete it by hand) instead.
 */
function holdsAutoDecisionLog(entryPath: string): boolean {
  try {
    return fs.statSync(path.join(entryPath, AUTO_DECISIONS_FILE)).size > 0;
  } catch {
    return false;
  }
}

type SweepVerdict = 'remove' | 'keep' | 'retain';

/** Stale entries are removed unless they hold an auto-decision log, which retains them (review I2/N4). */
function sweepVerdict(entryPath: string, ageMs: number, ttlMs: number): SweepVerdict {
  if (ageMs <= ttlMs) return 'keep';
  return holdsAutoDecisionLog(entryPath) ? 'retain' : 'remove';
}

export async function runCleanupSessions(
  options: CleanupSessionsOptions
): Promise<Result<CleanupSessionsResult, CLIError>> {
  const cwd = options.cwd ?? process.cwd();
  const dryRun = options.dryRun ?? false;
  const sessionsDir = path.join(cwd, '.harness', 'sessions');

  const result: CleanupSessionsResult = { removed: [], kept: [], retained: [] };

  if (!fs.existsSync(sessionsDir)) {
    return Ok(result);
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
  } catch (err) {
    return Err(
      new CLIError(
        `Failed to read sessions directory: ${err instanceof Error ? err.message : String(err)}`,
        ExitCode.ERROR
      )
    );
  }

  const now = Date.now();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionPath = path.join(sessionsDir, entry.name);
    const verdict = sweepVerdict(sessionPath, now - getMostRecentMtime(sessionPath), STALE_TTL_MS);
    if (verdict !== 'remove') {
      result.kept.push(entry.name);
      if (verdict === 'retain') result.retained.push(entry.name);
      continue;
    }
    result.removed.push(entry.name);
    if (!dryRun) {
      try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      } catch (err) {
        return Err(
          new CLIError(
            `Failed to remove session ${entry.name}: ${err instanceof Error ? err.message : String(err)}`,
            ExitCode.ERROR
          )
        );
      }
    }
  }

  return Ok(result);
}

function printSessionList(label: string, sessions: string[]): void {
  if (sessions.length === 0) return;
  console.log(`\n${label} (${sessions.length}):`);
  for (const s of sessions) console.log(`  - ${s}`);
}

export function printCleanupSessionsResult(
  result: CleanupSessionsResult,
  dryRun: boolean,
  asJson: boolean
): void {
  const { removed, kept } = result;
  if (asJson) {
    console.log(JSON.stringify({ removed, kept, retained: result.retained, dryRun }, null, 2));
    return;
  }
  if (removed.length === 0 && kept.length === 0) {
    console.log('No sessions found.');
    return;
  }
  const removeLabel = dryRun ? 'Stale (would remove)' : 'Removed';
  printSessionList(removeLabel, removed);
  printSessionList('Kept', kept);
  printSessionList('Kept because it holds an auto-decision log', result.retained);
  if (!dryRun && removed.length > 0) {
    console.log(`\nCleaned up ${removed.length} stale session(s).`);
  }
}

/**
 * Hermes Phase 2 — Per-target sweep result.
 *
 * `removed` / `kept` are entry names relative to the target directory
 * (e.g. `cache/osv/foo@1.json` → `osv/foo@1.json`).
 */
export interface CleanupTargetResult {
  target: string;
  removed: string[];
  kept: string[];
  /** Stale sessions kept only because they hold a non-empty auto-decision log (review N4); a subset of kept. */
  retained: string[];
}

export interface CleanupAllOptions {
  cwd?: string;
  dryRun?: boolean;
  include?: string[];
  exclude?: string[];
  /** Per-target TTL overrides keyed by target name. */
  ttlHours?: Record<string, number>;
}

function selectTargets(opts: CleanupAllOptions): CleanupTarget[] {
  const include = opts.include?.length ? new Set(opts.include) : null;
  const exclude = opts.exclude?.length ? new Set(opts.exclude) : null;
  return CLEANUP_TARGETS.filter((t) => {
    if (include) return include.has(t.name);
    if (exclude) return !exclude.has(t.name);
    return true;
  });
}

/**
 * Sweep registered `.harness/` targets per their configured TTLs. The
 * original `runCleanupSessions` remains the surface for the no-flag CLI
 * path and is unchanged in semantics.
 */
export async function runCleanupAll(
  opts: CleanupAllOptions
): Promise<Result<CleanupTargetResult[], CLIError>> {
  const cwd = opts.cwd ?? process.cwd();
  const dryRun = opts.dryRun ?? false;
  const ttlOverrides = opts.ttlHours ?? {};
  const targets = selectTargets(opts);

  const results: CleanupTargetResult[] = [];
  for (const target of targets) {
    const ttlMs =
      (ttlOverrides[target.name] ?? 0) > 0
        ? ttlOverrides[target.name]! * ONE_HOUR_MS
        : target.defaultTtlMs;
    const dir = path.join(cwd, '.harness', target.relativeDir);
    const sweepResult = await sweepDirectory(dir, ttlMs, dryRun);
    if (!sweepResult.ok) return Err(sweepResult.error);
    results.push({ target: target.name, ...sweepResult.value });
  }
  return Ok(results);
}

async function sweepDirectory(
  dir: string,
  ttlMs: number,
  dryRun: boolean
): Promise<Result<{ removed: string[]; kept: string[]; retained: string[] }, CLIError>> {
  const removed: string[] = [];
  const kept: string[] = [];
  const retained: string[] = [];
  if (!fs.existsSync(dir)) return Ok({ removed, kept, retained });

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return Err(
      new CLIError(
        `Failed to read ${dir}: ${err instanceof Error ? err.message : String(err)}`,
        ExitCode.ERROR
      )
    );
  }

  const now = Date.now();
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    const verdict = sweepVerdict(entryPath, now - mtimeOf(entryPath), ttlMs);
    if (verdict !== 'remove') {
      kept.push(entry.name);
      if (verdict === 'retain') retained.push(entry.name);
      continue;
    }
    removed.push(entry.name);
    if (!dryRun) {
      try {
        fs.rmSync(entryPath, { recursive: true, force: true });
      } catch (err) {
        return Err(
          new CLIError(
            `Failed to remove ${entryPath}: ${err instanceof Error ? err.message : String(err)}`,
            ExitCode.ERROR
          )
        );
      }
    }
  }
  return Ok({ removed, kept, retained });
}

function mtimeOf(target: string): number {
  try {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) return getMostRecentMtime(target);
    return stat.mtimeMs;
  } catch {
    return 0;
  }
}

export function printCleanupAllResult(
  results: CleanupTargetResult[],
  dryRun: boolean,
  asJson: boolean
): void {
  if (asJson) {
    console.log(JSON.stringify({ results, dryRun }, null, 2));
    return;
  }
  let totalRemoved = 0;
  for (const r of results) {
    const total = r.removed.length + r.kept.length;
    if (total === 0) {
      console.log(`[cleanup] ${r.target.padEnd(18)} (no entries)`);
      continue;
    }
    const verb = dryRun ? 'would remove' : 'removed';
    const held =
      r.retained.length > 0 ? `, ${r.retained.length} kept for an auto-decision log` : '';
    console.log(
      `[cleanup] ${r.target.padEnd(18)} ${String(total).padStart(3)} entries  ${r.removed.length} ${verb}${held}`
    );
    totalRemoved += r.removed.length;
  }
  if (totalRemoved > 0) {
    console.log(
      `\n${dryRun ? 'Would remove' : 'Removed'} ${totalRemoved} stale entry(ies) across targets.`
    );
  }
}

export function createCleanupSessionsCommand(): Command {
  const command = new Command('cleanup-sessions')
    .description(
      'Remove stale entries from .harness/. Default: only .harness/sessions/ (no write in 24h).'
    )
    .option('--dry-run', 'List stale entries without deleting them', false)
    .option('--path <path>', 'Project root path', '.')
    .option('--all', 'Sweep every registered .harness/ target')
    .option(
      '--include <list>',
      'Comma-separated target names (mutually-exclusive with --exclude/--all)'
    )
    .option('--exclude <list>', 'Comma-separated target names to skip')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = path.resolve(opts.path);
      const asJson = Boolean(globalOpts.json);
      if (opts.all || opts.include || opts.exclude) {
        await runExtendedSweep(cwd, opts, asJson);
        return;
      }
      await runSessionsOnlySweep(cwd, opts, asJson);
    });

  return command;
}

async function runExtendedSweep(
  cwd: string,
  opts: { dryRun?: boolean; include?: string; exclude?: string },
  asJson: boolean
): Promise<void> {
  const configResult = resolveConfig();
  const configuredTtls = configResult.ok ? configResult.value.cleanup?.ttlHours : undefined;
  const cleanupOpts: CleanupAllOptions = { cwd, dryRun: Boolean(opts.dryRun) };
  if (configuredTtls !== undefined) cleanupOpts.ttlHours = configuredTtls;
  if (opts.include) {
    cleanupOpts.include = String(opts.include)
      .split(',')
      .map((s) => s.trim());
  }
  if (opts.exclude) {
    cleanupOpts.exclude = String(opts.exclude)
      .split(',')
      .map((s) => s.trim());
  }
  const result = await runCleanupAll(cleanupOpts);
  if (!result.ok) {
    logger.error(result.error.message);
    process.exit(result.error.exitCode);
    return;
  }
  printCleanupAllResult(result.value, Boolean(opts.dryRun), asJson);
  process.exit(ExitCode.SUCCESS);
}

async function runSessionsOnlySweep(
  cwd: string,
  opts: { dryRun?: boolean },
  asJson: boolean
): Promise<void> {
  const result = await runCleanupSessions({ cwd, dryRun: Boolean(opts.dryRun) });
  if (!result.ok) {
    logger.error(result.error.message);
    process.exit(result.error.exitCode);
    return;
  }
  printCleanupSessionsResult(result.value, Boolean(opts.dryRun), asJson);
  process.exit(ExitCode.SUCCESS);
}

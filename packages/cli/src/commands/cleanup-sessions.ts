// packages/cli/src/commands/cleanup-sessions.ts
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';

const STALE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CleanupSessionsOptions {
  cwd?: string;
  dryRun?: boolean;
}

interface CleanupSessionsResult {
  removed: string[];
  kept: string[];
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

export async function runCleanupSessions(
  options: CleanupSessionsOptions
): Promise<Result<CleanupSessionsResult, CLIError>> {
  const cwd = options.cwd ?? process.cwd();
  const dryRun = options.dryRun ?? false;
  const sessionsDir = path.join(cwd, '.harness', 'sessions');

  const result: CleanupSessionsResult = { removed: [], kept: [] };

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
    const mostRecent = getMostRecentMtime(sessionPath);
    const ageMs = now - mostRecent;

    if (ageMs > STALE_TTL_MS) {
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
    } else {
      result.kept.push(entry.name);
    }
  }

  return Ok(result);
}

function printResult(result: CleanupSessionsResult, dryRun: boolean, asJson: boolean): void {
  const { removed, kept } = result;
  if (asJson) {
    console.log(JSON.stringify({ removed, kept, dryRun }, null, 2));
    return;
  }
  if (removed.length === 0 && kept.length === 0) {
    console.log('No sessions found.');
    return;
  }
  if (removed.length > 0) {
    const label = dryRun ? 'Stale (would remove)' : 'Removed';
    console.log(`\n${label} (${removed.length}):`);
    for (const s of removed) console.log(`  - ${s}`);
  }
  if (kept.length > 0) {
    console.log(`\nKept (${kept.length}):`);
    for (const s of kept) console.log(`  - ${s}`);
  }
  if (!dryRun && removed.length > 0) {
    console.log(`\nCleaned up ${removed.length} stale session(s).`);
  }
}

export function createCleanupSessionsCommand(): Command {
  const command = new Command('cleanup-sessions')
    .description('Remove stale session directories from .harness/sessions/ (no write in 24h)')
    .option('--dry-run', 'List stale sessions without deleting them', false)
    .option('--path <path>', 'Project root path', '.')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = path.resolve(opts.path);
      const result = await runCleanupSessions({ cwd, dryRun: opts.dryRun });
      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(result.error.exitCode);
        return;
      }
      printResult(result.value, opts.dryRun, globalOpts.json);
      process.exit(ExitCode.SUCCESS);
    });

  return command;
}

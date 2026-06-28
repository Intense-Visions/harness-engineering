import { Command } from 'commander';
import * as path from 'path';
import * as readline from 'readline';
import { eventSourcing } from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';

async function confirmReset(): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question('Reset project state? This cannot be undone. [y/N] ', resolve);
  });
  rl.close();
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

async function runReset(opts: { path: string; stream?: string; yes?: boolean }): Promise<void> {
  const projectPath = path.resolve(opts.path);

  if (!opts.yes && !(await confirmReset())) {
    logger.info('Reset cancelled.');
    process.exit(ExitCode.SUCCESS);
  }

  // Event-sourced reset: truncate the authoritative event log + clear the derived snapshot/blobs,
  // then re-genesis to DEFAULT_STATE (Option A). The legacy `fs.unlinkSync(state.json)` is now a
  // no-op against the real store, so route through the same path as the MCP reset (W3).
  const result = await eventSourcing.resetEventLog(projectPath, { stream: opts.stream });
  if (!result.ok) {
    logger.error(`Failed to reset state: ${result.error.message}`);
    process.exit(ExitCode.ERROR);
  }
  logger.success('Project state reset.');
  process.exit(ExitCode.SUCCESS);
}

export function createResetCommand(): Command {
  return new Command('reset')
    .description('Reset project state (truncates the event log to a fresh default)')
    .option('--path <path>', 'Project root path', '.')
    .option('--stream <name>', 'Target a specific stream')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (opts) => runReset(opts));
}

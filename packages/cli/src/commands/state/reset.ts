import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { resolveStreamPath } from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';

async function resolveStatePath(projectPath: string, stream?: string): Promise<string> {
  if (stream) {
    const streamResult = await resolveStreamPath(projectPath, { stream });
    if (!streamResult.ok) {
      logger.error(streamResult.error.message);
      process.exit(ExitCode.ERROR);
    }
    return path.join(streamResult.value, 'state.json');
  }
  return path.join(projectPath, '.harness', 'state.json');
}

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
  const statePath = await resolveStatePath(projectPath, opts.stream);

  if (!fs.existsSync(statePath)) {
    logger.info('No state file found. Nothing to reset.');
    process.exit(ExitCode.SUCCESS);
  }

  if (!opts.yes && !(await confirmReset())) {
    logger.info('Reset cancelled.');
    process.exit(ExitCode.SUCCESS);
  }

  try {
    fs.unlinkSync(statePath);
    logger.success('Project state reset.');
  } catch (e) {
    logger.error(`Failed to reset state: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(ExitCode.ERROR);
  }
  process.exit(ExitCode.SUCCESS);
}

export function createResetCommand(): Command {
  return new Command('reset')
    .description('Reset project state (deletes .harness/state.json)')
    .option('--path <path>', 'Project root path', '.')
    .option('--stream <name>', 'Target a specific stream')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (opts) => runReset(opts));
}

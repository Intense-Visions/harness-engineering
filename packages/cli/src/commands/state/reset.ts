import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { resolveStreamPath } from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';

export function createResetCommand(): Command {
  return new Command('reset')
    .description('Reset project state (deletes .harness/state.json)')
    .option('--path <path>', 'Project root path', '.')
    .option('--stream <name>', 'Target a specific stream')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (opts, _cmd) => {
      const projectPath = path.resolve(opts.path);

      let statePath: string;
      if (opts.stream) {
        const streamResult = await resolveStreamPath(projectPath, { stream: opts.stream });
        if (!streamResult.ok) {
          logger.error(streamResult.error.message);
          process.exit(ExitCode.ERROR);
          return;
        }
        statePath = path.join(streamResult.value, 'state.json');
      } else {
        statePath = path.join(projectPath, '.harness', 'state.json');
      }

      if (!fs.existsSync(statePath)) {
        logger.info('No state file found. Nothing to reset.');
        process.exit(ExitCode.SUCCESS);
        return;
      }

      if (!opts.yes) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>((resolve) => {
          rl.question('Reset project state? This cannot be undone. [y/N] ', resolve);
        });
        rl.close();
        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
          logger.info('Reset cancelled.');
          process.exit(ExitCode.SUCCESS);
          return;
        }
      }

      try {
        fs.unlinkSync(statePath);
        logger.success('Project state reset.');
      } catch (e) {
        logger.error(`Failed to reset state: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(ExitCode.ERROR);
        return;
      }
      process.exit(ExitCode.SUCCESS);
    });
}

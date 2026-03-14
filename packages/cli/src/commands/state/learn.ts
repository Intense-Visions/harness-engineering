import { Command } from 'commander';
import * as path from 'path';
import { appendLearning } from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';

export function createLearnCommand(): Command {
  return new Command('learn')
    .description('Append a learning to .harness/learnings.md')
    .argument('<message>', 'The learning to record')
    .option('--path <path>', 'Project root path', '.')
    .action(async (message, opts, _cmd) => {
      const projectPath = path.resolve(opts.path);
      const result = await appendLearning(projectPath, message);

      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(ExitCode.ERROR);
        return;
      }

      logger.success(`Learning recorded.`);
      process.exit(ExitCode.SUCCESS);
    });
}

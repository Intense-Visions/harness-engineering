import { Command } from 'commander';
import { validate } from '@harness-engineering/linter-gen';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';

export function createValidateCommand(): Command {
  return new Command('validate')
    .description('Validate harness-linter.yml config')
    .option('-c, --config <path>', 'Path to harness-linter.yml', './harness-linter.yml')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const result = await validate({ configPath: options.config });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.success) {
          logger.success(`Config valid: ${result.ruleCount} rules defined`);
        } else {
          logger.error(`Config invalid: ${result.error.message}`);
          process.exit(ExitCode.VALIDATION_FAILED);
        }
      } catch (err) {
        throw new CLIError(`Validation failed: ${(err as Error).message}`, ExitCode.ERROR);
      }
    });
}

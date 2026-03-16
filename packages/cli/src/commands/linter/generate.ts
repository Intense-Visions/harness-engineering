import { Command } from 'commander';
import { generate } from '@harness-engineering/linter-gen';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';

export function createGenerateCommand(): Command {
  return new Command('generate')
    .description('Generate ESLint rules from harness-linter.yml')
    .option('-c, --config <path>', 'Path to harness-linter.yml', './harness-linter.yml')
    .option('-o, --output <dir>', 'Override output directory')
    .option('--clean', 'Remove existing files before generating')
    .option('--dry-run', 'Preview without writing files')
    .option('--json', 'Output as JSON')
    .option('--verbose', 'Show detailed output')
    .action(async (options) => {
      try {
        if (options.verbose) {
          logger.info(`Parsing config: ${options.config}`);
        }

        const result = await generate({
          configPath: options.config,
          outputDir: options.output,
          clean: options.clean,
          dryRun: options.dryRun,
        });

        if (!result.success) {
          const errorMessages = result.errors.map((e) => {
            switch (e.type) {
              case 'parse':
                return `Config error: ${e.error.message}`;
              case 'template':
                return `Template error for '${e.ruleName}': ${e.error.message}`;
              case 'render':
                return `Render error for '${e.ruleName}': ${e.error.message}`;
              case 'write':
                return `Write error for '${e.path}': ${e.error.message}`;
            }
          });

          if (options.json) {
            console.log(JSON.stringify({ success: false, errors: errorMessages }, null, 2));
          } else {
            errorMessages.forEach((msg) => logger.error(msg));
          }
          process.exit(ExitCode.VALIDATION_FAILED);
        }

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                outputDir: result.outputDir,
                rulesGenerated: result.rulesGenerated,
                dryRun: result.dryRun,
              },
              null,
              2
            )
          );
        } else {
          if (result.dryRun) {
            logger.info('Dry run - no files written');
          }
          result.rulesGenerated.forEach((name) => {
            logger.success(`Generated ${name}.ts`);
          });
          logger.success(`Generated index.ts`);
          logger.info(`\nGenerated ${result.rulesGenerated.length} rules to ${result.outputDir}`);
        }
      } catch (err) {
        throw new CLIError(`Generation failed: ${(err as Error).message}`, ExitCode.ERROR);
      }
    });
}

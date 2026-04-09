import { Command } from 'commander';
import {
  generate,
  type GenerateResult,
  type GeneratorError,
} from '@harness-engineering/linter-gen';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';

function formatGenerateError(e: GeneratorError): string {
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
}

type FailureResult = Extract<GenerateResult, { success: false }>;
type SuccessResult = Extract<GenerateResult, { success: true }>;

function handleFailure(result: FailureResult, useJson: boolean): void {
  const errorMessages = result.errors.map(formatGenerateError);
  if (useJson) {
    console.log(JSON.stringify({ success: false, errors: errorMessages }, null, 2));
  } else {
    errorMessages.forEach((msg) => logger.error(msg));
  }
}

function handleSuccess(result: SuccessResult, useJson: boolean): void {
  if (useJson) {
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
    return;
  }
  if (result.dryRun) logger.info('Dry run - no files written');
  result.rulesGenerated.forEach((name) => logger.success(`Generated ${name}.ts`));
  logger.success(`Generated index.ts`);
  logger.info(`\nGenerated ${result.rulesGenerated.length} rules to ${result.outputDir}`);
}

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
        if (options.verbose) logger.info(`Parsing config: ${options.config}`);
        const result = await generate({
          configPath: options.config,
          outputDir: options.output,
          clean: options.clean,
          dryRun: options.dryRun,
        });
        if (!result.success) {
          handleFailure(result, options.json);
          process.exit(ExitCode.VALIDATION_FAILED);
          return;
        }
        handleSuccess(result, options.json);
      } catch (err) {
        throw new CLIError(`Generation failed: ${(err as Error).message}`, ExitCode.ERROR);
      }
    });
}

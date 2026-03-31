import { Command } from 'commander';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { INTEGRATION_REGISTRY } from '../../integrations/registry';
import { readIntegrationsConfig, writeIntegrationsConfig } from '../../integrations/config';
import { CLIError, ExitCode } from '../../utils/errors';
import { logger } from '../../output/logger';

/**
 * Core logic for dismissing an integration. Separated from Commander for testability.
 */
export function dismissIntegration(cwd: string, name: string): Result<string, CLIError> {
  const def = INTEGRATION_REGISTRY.find((i) => i.name === name);
  if (!def) {
    return Err(
      new CLIError(
        `Integration '${name}' not found in registry. Run 'harness integrations list' to see available integrations.`,
        ExitCode.ERROR
      )
    );
  }

  const configPath = path.join(cwd, 'harness.config.json');
  const integConfig = readIntegrationsConfig(configPath);

  if (!integConfig.dismissed.includes(def.name)) {
    integConfig.dismissed.push(def.name);
  }

  writeIntegrationsConfig(configPath, integConfig);

  return Ok(def.displayName);
}

/**
 * Creates the 'integrations dismiss' subcommand.
 */
export function createDismissIntegrationCommand(): Command {
  return new Command('dismiss')
    .description('Suppress doctor recommendations for an integration')
    .argument('<name>', 'Integration name (e.g. perplexity, augment-code)')
    .action(async (name: string, _opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();
      const result = dismissIntegration(cwd, name);

      if (!result.ok) {
        if (!globalOpts.quiet) {
          logger.error(result.error.message);
        }
        process.exit(result.error.exitCode);
        return;
      }

      if (!globalOpts.quiet) {
        console.log('');
        logger.info(
          `${result.value} dismissed. It will no longer appear in 'harness doctor' suggestions.`
        );
        console.log('');
      }

      process.exit(ExitCode.SUCCESS);
    });
}

import { Command } from 'commander';
import * as path from 'path';
import chalk from 'chalk';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { INTEGRATION_REGISTRY } from '../../integrations/registry';
import {
  writeMcpEntry,
  readIntegrationsConfig,
  writeIntegrationsConfig,
} from '../../integrations/config';
import { CLIError, ExitCode } from '../../utils/errors';
import { logger } from '../../output/logger';

interface AddResult {
  name: string;
  displayName: string;
  envVarMissing: boolean;
  envVar?: string;
  installHint?: string;
}

/**
 * Core logic for adding an integration. Separated from Commander for testability.
 */
export function addIntegration(cwd: string, name: string): Result<AddResult, CLIError> {
  const def = INTEGRATION_REGISTRY.find((i) => i.name === name);
  if (!def) {
    return Err(
      new CLIError(
        `Integration '${name}' not found in registry. Run 'harness integrations list' to see available integrations.`,
        ExitCode.ERROR
      )
    );
  }

  if (def.tier === 0) {
    return Err(
      new CLIError(
        `${def.displayName} is a Tier 0 integration, already configured by 'harness setup'. Run 'harness setup' if missing.`,
        ExitCode.ERROR
      )
    );
  }

  // Write MCP entry to .mcp.json
  const mcpPath = path.join(cwd, '.mcp.json');
  const mcpEntry: { command: string; args?: string[]; env?: Record<string, string> } = {
    command: def.mcpConfig.command,
  };
  if (def.mcpConfig.args.length > 0) mcpEntry.args = def.mcpConfig.args;
  if (def.mcpConfig.env) mcpEntry.env = def.mcpConfig.env;
  writeMcpEntry(mcpPath, def.name, mcpEntry);

  // Update harness.config.json
  const configPath = path.join(cwd, 'harness.config.json');
  const integConfig = readIntegrationsConfig(configPath);

  // Add to enabled (if not already)
  if (!integConfig.enabled.includes(def.name)) {
    integConfig.enabled.push(def.name);
  }

  // Remove from dismissed (if present)
  integConfig.dismissed = integConfig.dismissed.filter((d) => d !== def.name);

  writeIntegrationsConfig(configPath, integConfig);

  // Check env var
  const envVarMissing = !!def.envVar && !process.env[def.envVar];

  return Ok({
    name: def.name,
    displayName: def.displayName,
    envVarMissing,
    envVar: def.envVar,
    installHint: def.installHint,
  });
}

/**
 * Creates the 'integrations add' subcommand.
 */
export function createAddIntegrationCommand(): Command {
  return new Command('add')
    .description('Enable an MCP integration')
    .argument('<name>', 'Integration name (e.g. perplexity, augment-code)')
    .action(async (name: string, _opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();
      const result = addIntegration(cwd, name);

      if (!result.ok) {
        if (!globalOpts.quiet) {
          logger.error(result.error.message);
        }
        process.exit(result.error.exitCode);
        return;
      }

      const { displayName, envVarMissing, envVar, installHint } = result.value;

      if (!globalOpts.quiet) {
        console.log('');
        logger.success(`${displayName} integration enabled.`);
        console.log('');
        if (envVarMissing && envVar) {
          logger.warn(`Set ${chalk.bold(envVar)} in your environment to activate.`);
          if (installHint) {
            console.log(`  ${chalk.dim(installHint)}`);
          }
          console.log('');
        }
      }

      process.exit(ExitCode.SUCCESS);
    });
}

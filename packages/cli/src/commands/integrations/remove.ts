import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { INTEGRATION_REGISTRY } from '../../integrations/registry';
import {
  removeMcpEntry,
  readIntegrationsConfig,
  writeIntegrationsConfig,
} from '../../integrations/config';
import { CLIError, ExitCode } from '../../utils/errors';
import { logger } from '../../output/logger';

/**
 * Core logic for removing an integration. Separated from Commander for testability.
 */
export function removeIntegration(cwd: string, name: string): Result<string, CLIError> {
  const def = INTEGRATION_REGISTRY.find((i) => i.name === name);
  if (!def) {
    return Err(
      new CLIError(
        `Integration '${name}' not found in registry. Run 'harness integrations list' to see available integrations.`,
        ExitCode.ERROR
      )
    );
  }

  // Remove MCP entry from .mcp.json
  const mcpPath = path.join(cwd, '.mcp.json');
  removeMcpEntry(mcpPath, def.name);

  // Gemini CLI parity: also remove from .gemini/settings.json if detected
  const geminiDir = path.join(cwd, '.gemini');
  if (fs.existsSync(geminiDir)) {
    const geminiPath = path.join(geminiDir, 'settings.json');
    removeMcpEntry(geminiPath, def.name);
  }

  // Update harness.config.json
  const configPath = path.join(cwd, 'harness.config.json');
  const integConfig = readIntegrationsConfig(configPath);
  integConfig.enabled = integConfig.enabled.filter((e) => e !== def.name);
  writeIntegrationsConfig(configPath, integConfig);

  return Ok(def.displayName);
}

/**
 * Creates the 'integrations remove' subcommand.
 */
export function createRemoveIntegrationCommand(): Command {
  return new Command('remove')
    .description('Remove an MCP integration')
    .argument('<name>', 'Integration name (e.g. perplexity, augment-code)')
    .action(async (name: string, _opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();
      const result = removeIntegration(cwd, name);

      if (!result.ok) {
        if (!globalOpts.quiet) {
          logger.error(result.error.message);
        }
        process.exit(result.error.exitCode);
        return;
      }

      if (!globalOpts.quiet) {
        console.log('');
        logger.success(`${result.value} integration removed.`);
        console.log('');
      }

      process.exit(ExitCode.SUCCESS);
    });
}
